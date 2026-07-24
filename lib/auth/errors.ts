/**
 * Maps Better Auth error responses to pt-BR messages shown to the user.
 *
 * The client returns errors as `{ code?, message?, status, statusText }`. We map
 * the known Better Auth error codes (see BASE_ERROR_CODES in @better-auth/core)
 * to friendly Brazilian Portuguese strings. Rate-limit responses (HTTP 429) get
 * a dedicated "try again later" message; anything else unmapped falls back to a
 * generic message (including the "Google not configured" case).
 */
import { PASSWORD_TOO_SHORT_MESSAGE } from "@/lib/auth/constants";

/** Shape of the error object returned by the Better Auth client. */
export interface AuthClientError {
  code?: string;
  message?: string;
  status?: number;
  statusText?: string;
}

/** Known Better Auth error codes mapped to pt-BR messages. */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha inválidos.",
  INVALID_PASSWORD: "E-mail ou senha inválidos.",
  USER_NOT_FOUND: "E-mail ou senha inválidos.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "E-mail ou senha inválidos.",
  INVALID_EMAIL: "Informe um e-mail válido.",
  USER_ALREADY_EXISTS: "Este e-mail já está cadastrado.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Este e-mail já está cadastrado.",
  PASSWORD_TOO_SHORT: PASSWORD_TOO_SHORT_MESSAGE,
  PASSWORD_TOO_LONG: "A senha é muito longa.",
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail antes de entrar.",
  PROVIDER_NOT_FOUND: "Login com Google indisponível no momento.",
};

const FALLBACK = "Não foi possível concluir. Tente novamente.";

/** HTTP 429 (rate limited): guide the user to wait instead of the generic fallback. */
const TOO_MANY_REQUESTS_STATUS = 429;
const TOO_MANY_REQUESTS_MESSAGE =
  "Muitas tentativas. Aguarde alguns instantes e tente novamente.";

/** Returns a pt-BR message for a Better Auth client error. */
export function authErrorMessage(error: AuthClientError | null | undefined): string {
  if (!error) return FALLBACK;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === TOO_MANY_REQUESTS_STATUS) return TOO_MANY_REQUESTS_MESSAGE;
  return FALLBACK;
}
