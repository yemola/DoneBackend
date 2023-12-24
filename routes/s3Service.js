require("dotenv").config();

const { Upload } = require("@aws-sdk/lib-storage");

const { S3 } = require("@aws-sdk/client-s3");

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

    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  const fileStream = fs.createReadStream(file.path);
  const param = {
    Bucket: bucketName,
    Body: fileStream,
    Key: file.filename,
  };
  return await new Upload({
    client: s3,
    params: param,
  }).done();
};

exports.s3Uploadv2 = async (files) => {
  const s3 = new S3({
    region,

    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const params = files.map((file) => {
    const fileStream = fs.createReadStream(file.path);
    return {
      Bucket: bucketName,
      Body: fileStream,
      Key: file.filename,
    };
  });

  return await Promise.all(
    params.map((param) =>
      new Upload({
        client: s3,
        params: param,
      }).done()
    )
  );
};

exports.s3Deletev2 = async (files) => {
  const s3 = new S3({
    region,

    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const params = files.map((file) => {
    const baseUrl = `https://${bucketName}.s3.${region}.amazonaws.com/`;

    return {
      Bucket: bucketName,
      Key: file.url.replace(new RegExp(`^${baseUrl}`), ""),
    };
  });

  return await Promise.all(params.map((param) => s3.deleteObject(param)));
};
