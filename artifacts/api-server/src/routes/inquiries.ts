import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { SubmitInquiryBody, GetInquiriesResponse } from "@workspace/api-zod";
import { db, inquiriesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { createHash } from "node:crypto";
import { hasEditorAccess } from "./homepage";
const router: IRouter = Router();
const attempts = new Map<string,{count:number;reset:number}>();
router.post("/inquiries",async(req,res)=>{
  const parsed = SubmitInquiryBody.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:"Please enter your name, a valid email, child’s grade(s), and program interest."});return;}
  if(parsed.data.website){res.status(201).json({received:true});return;}
  const now=Date.now();
  for(const [key,value] of attempts) if(value.reset<=now)attempts.delete(key);
  const key=createHash("sha256").update(req.ip || req.socket.remoteAddress || "unknown").digest("hex");
  const limit=attempts.get(key)||{count:0,reset:now+15*60*1000};
  if(limit.count>=5){res.status(429).json({error:"Too many requests. Please call (970) 346-0099 or try again in 15 minutes."});return;}
  limit.count++;attempts.set(key,limit);
  const {website:_honeypot,...input}=parsed.data;
  await db.insert(inquiriesTable).values(input);
  res.status(201).json({received:true});
});
router.get("/inquiries",async(req,res)=>{
  res.set("Cache-Control","no-store");
  if(!getAuth(req).userId){res.status(401).json({error:"Sign in to view office inquiries."});return;}
  if(!await hasEditorAccess(req)){res.status(403).json({error:"Editor approval is required."});return;}
  const records=await db.select().from(inquiriesTable).orderBy(desc(inquiriesTable.createdAt));
  res.json(GetInquiriesResponse.parse(records.map(r=>({...r,createdAt:r.createdAt.toISOString()}))));
});
export default router;
