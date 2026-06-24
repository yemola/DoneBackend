require("dotenv").config();
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { v4: uuid } = require("uuid");
const fs = require("fs");

const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_BUCKET_REGION;

// Shared S3 client instance (v3 uses credentials from env automatically,
// but we read them explicitly to maintain backwards compat with existing .env)
const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

// Helper: build the public URL for an uploaded object
const buildUrl = (key) =>
  `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

// uploads a single file to s3
exports.s3UploadOne = async (file) => {
  const fileStream = fs.createReadStream(file.path);

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucketName,
      Body: fileStream,
      Key: file.filename,
      // Use detected mimetype, fall back to octet-stream (safe universal default)
      ContentType: file.mimetype || "application/octet-stream",
    },
  });

  const result = await upload.done();

  // Clean up original file from local uploads/profile folder
  try {
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch (err) {
    console.error(`Error deleting local profile temp file ${file.path}:`, err.message);
  }

  // v3 Upload returns ETag/Location — build URL explicitly for consistency
  return {
    ...result,
    Location: result.Location ?? buildUrl(file.filename),
  };
};

exports.s3Uploadv2 = async (files) => {
  console.log(`[S3] s3Uploadv2 called with ${files?.length ?? 0} file(s)`);
  if (!files || files.length === 0) return [];

  const uploadPromises = files.map(async (file, i) => {
    // If the file has a fullPath and thumbPath from imageResize middleware, upload both
    if (file.fullPath && file.thumbPath) {
      console.log(`  [S3][${i}] Uploading full+thumb for key=${file.filename}`);
      // sharp always outputs JPEG regardless of original format (HEIC, PNG, etc.)
      const fullUpload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucketName,
          Body: fs.createReadStream(file.fullPath),
          Key: `${file.filename}_full.jpg`,
          ContentType: "image/jpeg",
        },
      });

      const thumbUpload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucketName,
          Body: fs.createReadStream(file.thumbPath),
          Key: `${file.filename}_thumb.jpg`,
          ContentType: "image/jpeg",
        },
      });

      const [fullResult, thumbResult] = await Promise.all([
        fullUpload.done(),
        thumbUpload.done(),
      ]);
      console.log(`  [S3][${i}] full uploaded: ${fullResult.Location ?? buildUrl(file.filename + '_full.jpg')}`);
      console.log(`  [S3][${i}] thumb uploaded: ${thumbResult.Location ?? buildUrl(file.filename + '_thumb.jpg')}`);

      // Clean up local temp files
      try {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        if (file.fullPath && fs.existsSync(file.fullPath)) fs.unlinkSync(file.fullPath);
        if (file.thumbPath && fs.existsSync(file.thumbPath)) fs.unlinkSync(file.thumbPath);
      } catch (cleanupErr) {
        console.error("Cleanup of local temp files failed:", cleanupErr.message);
      }

      return {
        url: fullResult.Location ?? buildUrl(`${file.filename}_full.jpg`),
        thumbnailUrl: thumbResult.Location ?? buildUrl(`${file.filename}_thumb.jpg`),
      };
    } else {
      console.log(`  [S3][${i}] Uploading raw file key=${file.filename} (no fullPath/thumbPath)`);
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucketName,
          Body: fs.createReadStream(file.path),
          Key: file.filename,
          // Use detected mimetype, fall back to octet-stream (safe universal default)
          ContentType: file.mimetype || "application/octet-stream",
        },
      });

      const result = await upload.done();

      try {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (cleanupErr) {
        console.error(`Error deleting local temp file ${file.path}:`, cleanupErr.message);
      }

      const url = result.Location ?? buildUrl(file.filename);
      return {
        url,
        thumbnailUrl: url,
      };
    }
  });

  return await Promise.all(uploadPromises);
};

exports.s3Deletev2 = async (files) => {
  const baseUrl = `https://${bucketName}.s3.${region}.amazonaws.com/`;
  const keysToDelete = [];

  files.forEach((file) => {
    if (file.url) {
      keysToDelete.push(file.url.replace(new RegExp(`^${baseUrl}`), ""));
    }
    if (file.thumbnailUrl && file.thumbnailUrl !== file.url) {
      keysToDelete.push(file.thumbnailUrl.replace(new RegExp(`^${baseUrl}`), ""));
    }
  });

  const deletePromises = keysToDelete.map((key) =>
    s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    )
  );

  return await Promise.all(deletePromises);
};

// downloads a file from s3

// exports.getFileStream = async (imagePath) => {
//   const downloadParam = {
//     Key: imagePath,
//     Bucket: bucketName,
//   };

//   return s3.getObject(downloadParam).createReadStream();
// };

// `${file.key}`

// https://donebucket1.s3.eu-central-1.amazonaws.com/

// `${uuid()}-${file.originalname}`
