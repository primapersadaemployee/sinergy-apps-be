import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const latestVersion = "kkbd-v1.0.0.apk";

// Konfigurasi AWS S3 client
const s3 = new S3Client({
  region: "ap-southeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const generateLinkApk = async (req, res) => {
  try {
    const command = new GetObjectCommand({
      Bucket: "kkbd-apps",
      Key: latestVersion,
    });

    // Berlaku 10 menit
    const url = await getSignedUrl(s3, command, { expiresIn: 600 });

    return url;
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ success: false, message: "Gagal generate Signed URL" });
  }
};

const downloadApk = async (req, res) => {
  try {
    const url = await generateLinkApk();

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Download APK</title>
        <meta charset="utf-8" />
        <style>
          body { 
            display: flex; 
            flex-direction: column;
            justify-content: center; 
            align-items: center; 
            height: 100dvh; 
            font-family: Arial, sans-serif; 
            background: #f4f4f9; 
            text-align: center;
          }
          h1 {
            font-size: 34px;
            margin-bottom: 20px;
            color: #333;
            padding: 20px 0;
          }
          .btn {
            padding: 15px 25px;
            background: #007bff;
            color: white;
            border-radius: 8px;
            text-decoration: none;
            font-size: 28px;
            transition: background 0.3s;
          }
          .btn:hover {
            background: #0056b3;
          }
        </style>
      </head>
      <body>
        <h1>KKKBD (Koperasi Konsumen Keluarga Besar Dispenda)</h1>
        <a class="btn" href="${url}">Download APK</a>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Gagal generate halaman download");
  }
};

const checkLatestVersion = (req, res) => {
  const latestVersion = "v1.0.1";
  try {
    const { version } = req.body;
    if (version !== latestVersion) {
      return res.status(403).json({
        success: false,
        message: "Silakan update aplikasi untuk mendapatkan versi terbaru",
      });
    }
    return res
      .status(200)
      .json({ success: true, message: "Aplikasi sudah dalam versi terbaru." });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Gagal memeriksa versi" });
  }
};

export { generateLinkApk, downloadApk, checkLatestVersion };
