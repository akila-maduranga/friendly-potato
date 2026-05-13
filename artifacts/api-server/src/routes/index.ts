import { Router, type IRouter } from "express";
import healthRouter from "./health";
import transcribeRouter from "./transcribe";
import creditsRouter from "./credits";

const router: IRouter = Router();

router.use(healthRouter);
router.use(transcribeRouter);
router.use(creditsRouter);

export default router;
