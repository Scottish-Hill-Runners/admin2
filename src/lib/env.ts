import { z } from "zod";

const optional = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const envSchema = z
  .object({
    AUTH_SECRET: optional,
    AUTH_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url().optional(),
    ),
    NEXTAUTH_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url().optional(),
    ),
    AUTH_GITHUB_ID: optional,
    AUTH_GITHUB_SECRET: optional,
    ADMIN_GITHUB_LOGINS: optional,
    CONTENT_REPO: z.string().min(1).default("Scottish-Hill-Runners/contents"),
    CONTENT_BRANCH: z.string().min(1).default("main"),
    CONTENT_STAGING_BRANCH: z.string().min(1).default("staging"),
    RESEND_API_KEY: optional,
    CLOUDINARY_CLOUD_NAME: optional,
    CLOUDINARY_API_KEY: optional,
    CLOUDINARY_API_SECRET: optional,
    CLOUDINARY_WEBHOOK_SECRET: optional,
    GLOBAL_CONFIG_API_TOKEN: optional,
    GLOBAL_CONFIG_ID: optional,
    BLOB_READ_WRITE_TOKEN: optional,
  })
  .superRefine((value, context) => {
    if (value.CONTENT_BRANCH === value.CONTENT_STAGING_BRANCH)
      context.addIssue({
        code: "custom",
        path: ["CONTENT_STAGING_BRANCH"],
        message: "Live and draft branches must differ",
      });
    const cloudinary = [
      value.CLOUDINARY_CLOUD_NAME,
      value.CLOUDINARY_API_KEY,
      value.CLOUDINARY_API_SECRET,
    ].filter(Boolean).length;
    if (cloudinary > 0 && cloudinary < 3)
      context.addIssue({
        code: "custom",
        path: ["CLOUDINARY_CLOUD_NAME"],
        message: "Cloudinary settings must be complete",
      });
  });

export const env = envSchema.parse(process.env);
export const adminLogins = new Set(
  (env.ADMIN_GITHUB_LOGINS ?? "")
    .split(",")
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean),
);
