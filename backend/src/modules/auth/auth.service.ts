import { hash, verify } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { badRequest, unauthorized } from "../../shared/http-errors.js";
import { authRepository } from "./auth.repository.js";
import type { AuthUser, LoginInput, PublicUser, RegisterInput } from "./auth.types.js";

const LOGIN_FAILURE_MESSAGE = "メールアドレスまたはパスワードが正しくありません。";
const DUPLICATE_EMAIL_MESSAGE = "このメールアドレスはすでに登録されています。";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toPublicUser(user: AuthUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const authService = {
  async register(input: RegisterInput): Promise<PublicUser> {
    const email = normalizeEmail(input.email);
    const name = input.name.trim();

    if (!isValidEmail(email)) {
      throw badRequest("メールアドレスを正しく入力してください。");
    }
    if (name.length === 0) {
      throw badRequest("表示名を入力してください。");
    }
    if (input.password.length < 8) {
      throw badRequest("パスワードは8文字以上で入力してください。");
    }
    if (await authRepository.findByEmail(email)) {
      throw badRequest(DUPLICATE_EMAIL_MESSAGE);
    }

    try {
      const user = await authRepository.create({
        email,
        name,
        passwordHash: await hash(input.password),
      });
      return toPublicUser(user);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw badRequest(DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }
  },

  async login(input: LoginInput): Promise<PublicUser> {
    const user = await authRepository.findByEmail(normalizeEmail(input.email));
    if (!user || !(await verify(user.passwordHash, input.password))) {
      throw unauthorized(LOGIN_FAILURE_MESSAGE);
    }
    return toPublicUser(user);
  },

  async getPublicUser(userId: string): Promise<PublicUser | null> {
    const user = await authRepository.findById(userId);
    return user ? toPublicUser(user) : null;
  },
};
