import multer from "multer";

const uploadSizeImage = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "Maximum image size is 2MB",
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
  next(err);
};

export default uploadSizeImage;
