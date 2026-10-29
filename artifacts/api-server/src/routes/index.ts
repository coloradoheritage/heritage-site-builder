import { Router, type IRouter } from "express";
import healthRouter from "./health";
import homepageRouter from "./homepage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(homepageRouter);

export default router;
