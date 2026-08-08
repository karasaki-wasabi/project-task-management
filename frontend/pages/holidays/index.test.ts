// Mount tests for HolidaysPage (task 7.2): list / register / delete / sync.
// Requirements 7.1, 7.3, 9.1, 9.2, 9.3, 9.4.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { NonBusinessDay } from "../../composables/useApiClient";
import HolidaysPage from "./index.vue";

const listHolidays = vi.fn();
const registerHoliday = vi.fn();
const deleteHoliday = vi.fn();
const syncHolidays = vi.fn();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listHolidays,
      registerHoliday,
      deleteHoliday,
      syncHolidays,
    }),
  };
});

const BadgeStub = defineComponent({
  name: "Badge",
  props: {
    tone: { type: String, required: true },
    label: { type: String, required: true },
  },
  template: `<span data-testid="badge" :data-tone="tone">{{ label }}</span>`,
});

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<div data-testid="error-alert">{{ message }}</div>`,
});

function makeHoliday(overrides: Partial<NonBusinessDay> = {}): NonBusinessDay {
  return {
    id: "h1",
    date: "2026-08-11",
    label: "山の日",
    source: "external_api",
    ...overrides,
  };
}

function buttonByText(wrapper: ReturnType<typeof mountPage>, text: string) {
  const match = wrapper.findAll("button").find((b) => b.text().trim() === text);
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

function mountPage() {
  return mount(HolidaysPage, {
    global: {
      stubs: {
        Badge: BadgeStub,
        ErrorAlert: ErrorAlertStub,
      },
    },
  });
}

describe("HolidaysPage (task 7.2)", () => {
  beforeEach(() => {
    listHolidays.mockReset();
    registerHoliday.mockReset();
    deleteHoliday.mockReset();
    syncHolidays.mockReset();
    listHolidays.mockResolvedValue([
      makeHoliday({ id: "h2", date: "2026-08-14", label: "夏季休業", source: "manual" }),
      makeHoliday(),
    ]);
    registerHoliday.mockResolvedValue(makeHoliday({ id: "h3", date: "2026-12-31", label: "年末休業", source: "manual" }));
    deleteHoliday.mockResolvedValue(undefined);
    syncHolidays.mockResolvedValue({ added: [makeHoliday({ id: "h4", date: "2026-09-23", label: "秋分の日" })], skippedExisting: 1 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads holidays on mount and renders sorted rows with source badges (Req 9.1)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listHolidays).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("休日マスタ");
    const dates = wrapper.findAll("[data-testid='holiday-date']").map((n) => n.text());
    expect(dates).toEqual(["2026-08-11", "2026-08-14"]);
    const badges = wrapper.findAll("[data-testid='badge']").map((n) => n.text());
    expect(badges).toEqual(["外部API", "手動"]);
  });

  it("registers a holiday with date/label then reloads (Req 9.2)", async () => {
    listHolidays.mockResolvedValueOnce([]).mockResolvedValueOnce([makeHoliday({ id: "h3", date: "2026-12-31", label: "年末休業", source: "manual" })]);
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get("#holiday-date").setValue("2026-12-31");
    await wrapper.get("#holiday-label").setValue("年末休業");
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    expect(registerHoliday).toHaveBeenCalledWith({ date: "2026-12-31", label: "年末休業" });
    expect(listHolidays).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("年末休業");
  });

  it("deletes a holiday by id then reloads (Req 9.2)", async () => {
    listHolidays
      .mockResolvedValueOnce([makeHoliday()])
      .mockResolvedValueOnce([]);
    const wrapper = mountPage();
    await flushPromises();

    await buttonByText(wrapper, "削除").trigger("click");
    await flushPromises();

    expect(deleteHoliday).toHaveBeenCalledWith("h1");
    expect(listHolidays).toHaveBeenCalledTimes(2);
  });

  it("syncs external holidays and shows the result summary (Req 9.3)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await buttonByText(wrapper, "祝日を取得").trigger("click");
    await flushPromises();
    await nextTick();

    expect(syncHolidays).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("新規追加: 1件 / スキップ: 1件");
    expect(listHolidays).toHaveBeenCalledTimes(2);
  });

  it("does not expose recurring-template management controls (Req 7.3)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).not.toContain("テンプレート");
    expect(wrapper.text()).not.toContain("繰り返し");
  });
});
