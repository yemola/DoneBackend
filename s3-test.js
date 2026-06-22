require("dotenv").config();
const { S3 } = require("aws-sdk");

const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_BUCKET_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_KEY;

const s3 = new S3({
  region,
  accessKeyId,
  secretAccessKey,
});

async function run() {
  try {
    console.log("Attempting to upload a test file to S3...");
    const param = {
      Bucket: bucketName,
      Body: "Hello from Antigravity backend S3 test!",
      Key: `test-${Date.now()}.txt`,
      ContentType: "image/jpeg",
    };
    const result = await s3.upload(param).promise();
    console.log("Success! File uploaded:", result.Location);
  } catch (error) {
    console.error("Failed to upload to S3:", error);
  }
}

run();
