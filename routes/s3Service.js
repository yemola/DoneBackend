require("dotenv").config();
const { S3 } = require("aws-sdk");
const uuid = require("uuid").v4;
const fs = require("fs");

const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_BUCKET_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_KEY;

// uploads a file to s3

exports.s3UploadOne = async (file) => {
  const s3 = new S3({
    region,
    accessKeyId,
    secretAccessKey,
  });
  const fileStream = fs.createReadStream(file.path);
  const param = {
    Bucket: bucketName,
    Body: fileStream,
    Key: file.filename,
    ContentType: file.mimetype || "image/jpeg",
  };
  const result = await s3.upload(param).promise();

  // Clean up original file from local uploads/profile folder
  try {
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch (err) {
    console.error(`Error deleting local profile temp file ${file.path}:`, err.message);
  }

  return result;
};

exports.s3Uploadv2 = async (files) => {
  const s3 = new S3({
    region,
    accessKeyId,
    secretAccessKey,
  });

  const uploadPromises = files.map(async (file) => {
    // If the file has a fullPath and thumbPath from imageResize middleware, upload both
    if (file.fullPath && file.thumbPath) {
      const fullStream = fs.createReadStream(file.fullPath);
      const thumbStream = fs.createReadStream(file.thumbPath);

      const fullUploadParam = {
        Bucket: bucketName,
        Body: fullStream,
        Key: `${file.filename}_full.jpg`,
        ContentType: "image/jpeg",
      };

      const thumbUploadParam = {
        Bucket: bucketName,
        Body: thumbStream,
        Key: `${file.filename}_thumb.jpg`,
        ContentType: "image/jpeg",
      };

      const [fullResult, thumbResult] = await Promise.all([
        s3.upload(fullUploadParam).promise(),
        s3.upload(thumbUploadParam).promise(),
      ]);

      // Clean up local temp files
      try {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        if (file.fullPath && fs.existsSync(file.fullPath)) fs.unlinkSync(file.fullPath);
        if (file.thumbPath && fs.existsSync(file.thumbPath)) fs.unlinkSync(file.thumbPath);
      } catch (cleanupErr) {
        console.error("Cleanup of local temp files failed:", cleanupErr.message);
      }

      return {
        url: fullResult.Location,
        thumbnailUrl: thumbResult.Location,
      };
    } else {
      // Fallback: upload original file
      const fileStream = fs.createReadStream(file.path);
      const uploadParam = {
        Bucket: bucketName,
        Body: fileStream,
        Key: file.filename,
        ContentType: file.mimetype || "image/jpeg",
      };
      const result = await s3.upload(uploadParam).promise();

      try {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (cleanupErr) {
        console.error(`Error deleting local temp file ${file.path}:`, cleanupErr.message);
      }

      return {
        url: result.Location,
        thumbnailUrl: result.Location,
      };
    }
  });

  return await Promise.all(uploadPromises);
};

exports.s3Deletev2 = async (files) => {
  const s3 = new S3({
    region,
    accessKeyId,
    secretAccessKey,
  });

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

  const deletePromises = keysToDelete.map((key) => {
    return s3.deleteObject({
      Bucket: bucketName,
      Key: key,
    }).promise();
  });

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
