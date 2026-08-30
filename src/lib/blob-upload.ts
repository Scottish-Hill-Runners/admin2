import { v2 as cloudinary } from "cloudinary";
import { env } from "@/lib/env";
import { attachmentBytes } from "@/lib/csv-source";
import type { ReceivedEmail } from "@/lib/resend";
import { extractSections, parseKeyValues } from "@/lib/email-parse";

function configured() {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  )
    throw new Error("Asset storage is not configured");
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}
export async function uploadEmailAsset(email: ReceivedEmail) {
  const values = extractSections(email.text ?? "")
    .map(parseKeyValues)
    .find((item) => item.folder);
  if (!values?.folder) throw new Error("No asset folder was specified");
  if (
    !/^(?:races\/[-\w]+|championships\/[-\w]+|clubs\/[-\w]+|documents\/)$/i.test(
      values.folder,
    )
  )
    throw new Error("The asset folder is not allowed");
  const attachment = email.attachments?.find(
    (item) => !/\.(csv|xlsx|ods)$/i.test(item.filename),
  );
  if (!attachment) throw new Error("No image or document attachment was found");
  const bytes = await attachmentBytes(email.id, attachment);
  const metadata = {
    title: values.title,
    description: values.description,
    license: values.license,
    individual_permission: values["individual permission"],
  };
  return new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = configured().uploader.upload_stream(
      {
        folder: values.folder,
        tags: values.tags
          ?.split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        use_filename: true,
        unique_filename: true,
        context: Object.entries(metadata)
          .filter(([, value]) => value)
          .map(([key, value]) => `${key}=${value}`)
          .join("|"),
      },
      (error, result) =>
        error
          ? reject(error)
          : result
            ? resolve({ secure_url: result.secure_url })
            : reject(new Error("Asset upload returned no result")),
    );
    stream.end(bytes);
  });
}
