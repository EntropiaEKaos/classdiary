import { expect, test } from "@playwright/test";
import { db } from "../src/lib/db";
import { createSaasCheckout } from "../src/lib/saas-checkout";
import { reconcileBillingSubscription } from "../src/lib/billing-reconciliation";

test("billing reconciliation applies provider state exactly once", async()=>{
  const org=await db.organization.findUnique({
    where:{slug:"escola-demo"},
    include:{subscription:true,memberships:{take:1}}
  });
  expect(org).not.toBeNull();
  expect(org!.subscription).not.toBeNull();

  const original=org!.subscription!;
  const key="reconcile-e2e-"+Date.now();
  const checkout=await createSaasCheckout({
    organizationId:org!.id,
    requestedByUserId:org!.memberships[0].userId,
    plan:"PRO",seats:80,
    customerEmail:"reconcile@example.local",
    returnUrl:"http://127.0.0.1:3000/dashboard/plano",
    idempotencyKey:key,
    provider:{
      async createCheckout(request){
        return {
          provider:"E2E_RECONCILE",
          providerSubscriptionId:"provider-sub-"+key,
          externalReference:request.externalReference,
          checkoutUrl:"https://example.test/reconcile"
        };
      }
    }
  });

  const provider={
    async createCheckout(){throw new Error("unused");},
    async reconcileSubscription(input:{providerSubscriptionId:string;externalReference:string}){
      return {
        provider:"E2E_RECONCILE",
        providerEventId:"reconcile-event-"+key,
        type:"CHECKOUT_APPROVED" as const,
        externalReference:input.externalReference,
        providerSubscriptionId:input.providerSubscriptionId,
        periodEnd:"2026-12-31T12:00:00.000Z"
      };
    }
  };

  try{
    const first=await reconcileBillingSubscription(org!.id,provider);
    const second=await reconcileBillingSubscription(org!.id,provider);
    expect(first.duplicated).toBe(false);
    expect(second.duplicated).toBe(true);

    const [subscription,updatedCheckout,events]=await Promise.all([
      db.subscription.findUnique({where:{organizationId:org!.id}}),
      db.billingCheckout.findUnique({where:{id:checkout.id}}),
      db.billingEvent.findMany({where:{providerEventId:"reconcile-event-"+key}})
    ]);

    expect(subscription?.status).toBe("ACTIVE");
    expect(subscription?.plan).toBe("PRO");
    expect(subscription?.seats).toBe(80);
    expect(subscription?.currentPeriodEnd?.toISOString()).toBe("2026-12-31T12:00:00.000Z");
    expect(updatedCheckout?.status).toBe("PAID");
    expect(events).toHaveLength(1);
  } finally {
    const event=await db.billingEvent.findUnique({
      where:{providerEventId:"reconcile-event-"+key},select:{id:true}
    });
    if(event){
      await db.auditLog.deleteMany({where:{entity:"BillingEvent",entityId:event.id}});
    }
    await db.billingEvent.deleteMany({where:{providerEventId:"reconcile-event-"+key}});
    await db.auditLog.deleteMany({where:{entity:"BillingCheckout",entityId:checkout.id}});
    await db.billingCheckout.deleteMany({where:{id:checkout.id}});
    await db.subscription.update({
      where:{organizationId:org!.id},
      data:{
        plan:original.plan,status:original.status,seats:original.seats,
        trialEndsAt:original.trialEndsAt,currentPeriodEnd:original.currentPeriodEnd
      }
    });
  }
});
