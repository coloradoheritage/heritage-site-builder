import { Router, type IRouter } from "express";
import healthRouter from "./health";
import homepageRouter from "./homepage";
import siteContentRouter from "./site-content";

const router: IRouter = Router();

router.use(healthRouter);
router.use(homepageRouter);
router.use(siteContentRouter);

export default router;
