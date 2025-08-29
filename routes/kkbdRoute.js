import express from "express";
import {
  downloadApk,
  checkLatestVersion,
} from "../controllers/kkbdController.js";

const kkbdRouter = express.Router();

kkbdRouter.get("/updates", downloadApk);
kkbdRouter.post("/version", checkLatestVersion);

export default kkbdRouter;
