const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const outputFolder = "public/assets";

module.exports = async (req, res, next) => {
  if (!req.files || !Array.isArray(req.files)) {
    console.log(`[imageResize] No files — req.files is`, req.files);
    req.files = [];
    return next();
  }

  console.log(`[imageResize] Received ${req.files.length} file(s) from multer`);

  const files = [];

  const resizePromises = req.files.map(async (file) => {
    try {
      // Convert HEIF/HEIC to JPEG first if needed
      let image = sharp(file.path);
      
      // Try to convert from HEIF/HEIC to JPEG buffer first
      if (file.mimetype === "image/heif" || file.mimetype === "image/heic") {
        image = sharp(file.path).toFormat("jpeg");
      }

      const fullPath = path.resolve(outputFolder, file.filename + "_full.jpg");
      const thumbPath = path.resolve(outputFolder, file.filename + "_thumb.jpg");

      await image
        .resize(1000)
        .jpeg({ quality: 50 })
        .toFile(fullPath);

      await sharp(file.path)
        .resize(100)
        .jpeg({ quality: 30 })
        .toFile(thumbPath);

      file.fullPath = fullPath;
      file.thumbPath = thumbPath;
      files.push(file);
    } catch (error) {
      console.error(`Error processing image ${file.filename}:`, error.message);
      // Continue processing other files instead of stopping
      try {
        fs.unlinkSync(file.path); // Clean up failed upload
      } catch (unlinkError) {
        console.error(`Could not delete file ${file.path}:`, unlinkError.message);
      }
    }
  });

  await Promise.all([...resizePromises]).catch((error) => {
    console.error("Error in image resizing:", error);
    // Don't throw here to allow partial uploads
  });

  req.files = files;
  console.log(`[imageResize] ${files.length} file(s) passed to next (after sharp processing)`);
  next();
};
