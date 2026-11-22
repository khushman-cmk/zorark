import { db } from "@/lib/db";
import { users, trips, userSessions, customerNotes, customerTags } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import CustomerDetailClient from "./CustomerDetailClient";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const customerResult = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const customer = customerResult[0];
  
  if (!customer) {
    notFound();
  }

  // Fetch some basic associated data
  const customerTrips = await db.select().from(trips).where(eq(trips.userId, id)).orderBy(desc(trips.createdAt));
  const sessions = await db.select().from(userSessions).where(eq(userSessions.userId, id)).orderBy(desc(userSessions.lastActive));
  const notes = await db.select().from(customerNotes).where(eq(customerNotes.customerId, id)).orderBy(desc(customerNotes.createdAt));
  const tags = await db.select().from(customerTags).where(eq(customerTags.customerId, id));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <CustomerDetailClient 
        customer={customer} 
        trips={customerTrips}
        sessions={sessions}
        notes={notes}
        tags={tags}
      />
    </div>
  );
}
