import express from "express";
import { addGames, getAllGames } from "../controllers/gameController.js";

const gameRouter = express.Router();

gameRouter.post("/", addGames);
gameRouter.get("/", getAllGames);

export default gameRouter;
