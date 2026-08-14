import { beforeEach, describe, expect, it, vi } from "vitest";
import { createErrorReportRateLimiter } from "../composables/useErrorReportRateLimit";

const fetchMock = vi.fn();
const showError = vi.fn();
const runWithContext = vi.fn((fn: () => unknown) => fn());

type ErrorReporter = {
  report: (message: string, stack?: string) => void;
  triggerErrorPage: (error: Error) => void;
  handleVueError: (error: unknown) => void;
  handleWindowError: (event: ErrorEvent) => void;
  handleUnhandledRejection: (event: PromiseRejectionEvent) => void;
};

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(undefined);
  showError.mockReset();
  runWithContext.mockReset();
  runWithContext.mockImplementation((fn: () => unknown) => fn());
  vi.stubGlobal("$fetch", fetchMock);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiBaseUrl: "http://backend:3000" },
  }));
  vi.stubGlobal("showError", showError);
  vi.stubGlobal("defineNuxtPlugin", <T>(plugin: T) => plugin);
  vi.stubGlobal("createErrorReportRateLimiter", createErrorReportRateLimiter);
});

async function createReporter(): Promise<ErrorReporter> {
  const { createErrorReporter } = await import("./error-reporter.client");
  return createErrorReporter({ runWithContext });
}

function expectReported(message: string, stack?: string): void {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("http://backend:3000/api/client-errors", {
    method: "POST",
    body: {
      message,
      stack,
      pageUrl: window.location.href,
      occurredAt: expect.any(String),
    },
  });
}

describe("error-reporter.client (task 2.2)", () => {
  describe("Vue errorHandler", () => {
    it("Error インスタンスを通報し、エラーページ表示もトリガーする", async () => {
      const { handleVueError } = await createReporter();
      const error = new Error("vue render failed");

      handleVueError(error);

      expectReported("vue render failed", error.stack);
      expect(runWithContext).toHaveBeenCalledTimes(1);
      expect(showError).toHaveBeenCalledTimes(1);
      expect(showError).toHaveBeenCalledWith(error);
    });

    it("Error でない値でも正規化して通報し、常にエラーページ表示をトリガーする", async () => {
      const { handleVueError } = await createReporter();

      handleVueError("string crash");

      expectReported("string crash", expect.any(String));
      expect(showError).toHaveBeenCalledTimes(1);
      const passed = showError.mock.calls[0]?.[0];
      expect(passed).toBeInstanceOf(Error);
      expect(passed.message).toBe("string crash");
    });
  });

  describe("window error", () => {
    it("Error インスタンスなら通報とエラーページ表示の両方を行う", async () => {
      const { handleWindowError } = await createReporter();
      const error = new Error("window boom");

      handleWindowError({ message: "window boom", error } as ErrorEvent);

      expectReported("window boom", error.stack);
      expect(runWithContext).toHaveBeenCalledTimes(1);
      expect(showError).toHaveBeenCalledTimes(1);
      expect(showError).toHaveBeenCalledWith(error);
    });

    it("Error インスタンスでなければ通報のみ行い、エラーページは出さない", async () => {
      const { handleWindowError } = await createReporter();

      handleWindowError({ message: "Script error.", error: null } as ErrorEvent);

      expectReported("Script error.", undefined);
      expect(showError).not.toHaveBeenCalled();
      expect(runWithContext).not.toHaveBeenCalled();
    });
  });

  describe("unhandledrejection", () => {
    it("Error インスタンスなら通報とエラーページ表示の両方を行う", async () => {
      const { handleUnhandledRejection } = await createReporter();
      const error = new Error("rejected");

      handleUnhandledRejection({ reason: error } as PromiseRejectionEvent);

      expectReported("rejected", error.stack);
      expect(runWithContext).toHaveBeenCalledTimes(1);
      expect(showError).toHaveBeenCalledTimes(1);
      expect(showError).toHaveBeenCalledWith(error);
    });

    it("Error インスタンスでなければ通報のみ行い、エラーページは出さない", async () => {
      const { handleUnhandledRejection } = await createReporter();

      handleUnhandledRejection({ reason: "canceled" } as PromiseRejectionEvent);

      expectReported("canceled", expect.any(String));
      expect(showError).not.toHaveBeenCalled();
      expect(runWithContext).not.toHaveBeenCalled();
    });
  });

  describe("既存の通報機能", () => {
    it("同一メッセージの連続通報は時間窓内で抑制される", async () => {
      const { handleVueError } = await createReporter();
      const error = new Error("duplicate");

      handleVueError(error);
      handleVueError(error);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("通報のレート制限はエラーページ表示には適用しない", async () => {
      const { handleVueError } = await createReporter();
      const error = new Error("duplicate display");

      handleVueError(error);
      handleVueError(error);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(showError).toHaveBeenCalledTimes(2);
    });

    it("通報の $fetch 失敗は握りつぶされ、エラーページ表示は行われる", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const { handleVueError } = await createReporter();
      const error = new Error("still show page");

      expect(() => handleVueError(error)).not.toThrow();
      expect(showError).toHaveBeenCalledTimes(1);
    });
  });

  describe("プラグインの購読", () => {
    it("既存の3箇所だけを購読し、default export は Nuxt プラグインのままである", async () => {
      const addEventListener = vi.spyOn(window, "addEventListener").mockImplementation(() => {});
      const { default: install, createErrorReporter } = await import("./error-reporter.client");

      expect(typeof createErrorReporter).toBe("function");
      expect(typeof install).toBe("function");

      const vueApp = { config: { errorHandler: undefined as ((error: unknown) => void) | undefined } };
      // Partial NuxtApp stub: only the fields the plugin reads in this test.
      install({ vueApp, runWithContext } as never);

      expect(typeof vueApp.config.errorHandler).toBe("function");
      const eventNames = addEventListener.mock.calls.map((call) => call[0]);
      expect(eventNames).toEqual(["error", "unhandledrejection"]);

      addEventListener.mockRestore();
    });
  });
});
