import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { MercadoPagoBillingProvider } from "../src/lib/mercado-pago-provider";

function headersFor(id:string, secret:string){
  const ts="1790791111", requestId="req-renewal";
  const manifest=`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1=createHmac("sha256",secret).update(manifest).digest("hex");
  return new Headers({"x-request-id":requestId,"x-signature":`ts=${ts},v1=${v1}`});
}

test("recurring approved invoice becomes PAYMENT_RENEWED", async()=>{
  const id="9001001", secret="renewal-secret";
  const calls:string[]=[];
  const fakeFetch=(async(url:string|URL|Request)=>{
    calls.push(String(url));
    if(String(url).includes("/authorized_payments/")){
      return new Response(JSON.stringify({
        id:9001001,preapproval_id:"pre-renewal",
        external_reference:"SAAS-renewal",payment:{status:"approved",status_detail:"accredited"}
      }),{status:200,headers:{"Content-Type":"application/json"}});
    }
    return new Response(JSON.stringify({
      id:"pre-renewal",status:"authorized",external_reference:"SAAS-renewal",
      next_payment_date:"2026-11-30T12:00:00.000Z"
    }),{status:200,headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;

  const provider=new MercadoPagoBillingProvider({
    accessToken:"test",webhookSecret:secret,
    prices:{STARTER:1,PRO:2,ENTERPRISE:3}
  },fakeFetch);

  const event=await provider.verifyWebhook!(
    JSON.stringify({type:"subscription_authorized_payment",action:"updated"}),
    headersFor(id,secret),
    {dataId:id,topic:"subscription_authorized_payment"}
  );

  expect(event.type).toBe("PAYMENT_RENEWED");
  expect(event.providerSubscriptionId).toBe("pre-renewal");
  expect(event.periodEnd).toBe("2026-11-30T12:00:00.000Z");
  expect(calls).toHaveLength(2);
});

test("recurring rejected invoice becomes PAYMENT_FAILED", async()=>{
  const id="9001002", secret="failure-secret";
  const fakeFetch=(async()=>new Response(JSON.stringify({
    id:9001002,external_reference:"SAAS-failure",
    payment:{status:"rejected",status_detail:"declined"}
  }),{status:200,headers:{"Content-Type":"application/json"}})) as typeof fetch;

  const provider=new MercadoPagoBillingProvider({
    accessToken:"test",webhookSecret:secret,
    prices:{STARTER:1,PRO:2,ENTERPRISE:3}
  },fakeFetch);

  const event=await provider.verifyWebhook!(
    JSON.stringify({type:"subscription_authorized_payment",action:"updated"}),
    headersFor(id,secret),
    {dataId:id,topic:"subscription_authorized_payment"}
  );

  expect(event.type).toBe("PAYMENT_FAILED");
  expect(event.payload?.paymentStatusDetail).toBe("declined");
});
