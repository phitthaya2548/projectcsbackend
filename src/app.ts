import express from "express";
import { router as register_customer } from "./controller/register_customer_controller";
import { router as register_store } from "./controller/register_store_controller";
import { router as login } from "./controller/auth_controller";
import { router as customer } from "./controller/customer_controller";
import { router as slipok } from "./controller/wallet_controller";
import { router as rider } from "./controller/rider_controller";
import { router as store } from "./controller/store_controller";
import { router as laundryStaff } from "./controller/laundrystaff_contorller";
import { router as orders } from "./controller/orders_controller";
import { router as ordersRider } from "./controller/orders_rider_controller";
import { router as ordersStaff } from "./controller/orders_staff_controller";
export const app = express();


app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true}));

app.use("", login); 
app.use("/register/customer", register_customer); 
app.use("/register/store", register_store); 
app.use("/customer",customer); 
app.use("/store",store);
app.use("/rider", rider);
app.use("/laundry_staff", laundryStaff);
app.use("/wallet", slipok);

app.use("/order/rider", ordersRider);
app.use("/order/staff", ordersStaff);
app.use("/order", orders);



app.use((_req,res)=>{
  res.status(404).json({
    ok:false,
    message:"Not found"
  });
});
app.use((req,res,next)=>{
  console.log(req.method, req.url);
  next();
});

app.use((err:any,_req:any,res:any,_next:any)=>{
  console.error(err);
  res.status(500).json({
    ok:false,
    message:"Internal Server Error"
  });
});
