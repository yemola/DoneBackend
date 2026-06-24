require("dotenv").config();
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_BUCKET_REGION;

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

async function run() {
  try {
    console.log("Attempting to upload a test file to S3...");
    const key = `test-${Date.now()}.txt`;
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Body: "Hello from Antigravity backend S3 test!",
      Key: key,
      ContentType: "text/plain",
    });
    await s3Client.send(command);
    const location = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
    console.log("Success! File uploaded:", location);
  } catch (error) {
    console.error("Failed to upload to S3:", error);
  }
}

run();
