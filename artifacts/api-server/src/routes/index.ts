import { Router, type IRouter } from "express";
import healthRouter from "./health";
import homepageRouter from "./homepage";
import siteContentRouter from "./site-content";
import inquiriesRouter from "./inquiries";

const router: IRouter = Router();

router.use(healthRouter);
router.use(homepageRouter);
router.use(siteContentRouter);
router.use(inquiriesRouter);

export default router;
