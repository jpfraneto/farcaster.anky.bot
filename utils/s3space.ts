import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

if (!process.env.SPACES_KEY || !process.env.SPACES_SECRET) {
  throw new Error("Missing required S3 credentials");
}

const s3Client = new S3Client({
  forcePathStyle: false,
  endpoint: "https://nyc3.digitaloceanspaces.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});

export const uploadToS3 = async (
  bucketName: string,
  key: string,
  body: any,
  contentType?: string
) => {
  try {
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: body,
      ACL: "public-read" as const,
      ContentType: contentType,
    };

    const data = await s3Client.send(new PutObjectCommand(params));
    console.log(
      "Successfully uploaded object: " + params.Bucket + "/" + params.Key
    );
    return data;
  } catch (err) {
    console.log("Error uploading to S3:", err);
    throw err;
  }
};

export { s3Client };
