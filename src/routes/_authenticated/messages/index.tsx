import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ConversationList } from "@/components/messaging/conversation-list";
import { getMyConversations } from "@/lib/messaging.functions";
import { useAppNavItems } from "@/lib/use-app-nav";

export const Route = createFileRoute("/_authenticated/messages/")({
  loader: () => getMyConversations(),
  component: MessagesIndex,
});

function MessagesIndex() {
  const { conversations } = Route.useLoaderData();
  const { navItems } = useAppNavItems();
  return (
    <DashboardShell
      title="Nachrichten"
      navItems={navItems}
      activeKey="messages"
    >
      <section className="overflow-hidden rounded-xl border border-border/50 bg-card">
        <header className="border-b border-border/50 px-4 py-3">
          <h1 className="text-lg font-semibold">Nachrichten</h1>
        </header>
        <div className="flex min-h-[32rem]">
          <aside className="flex w-full max-w-md flex-col border-r border-border/50">
            <ConversationList conversations={conversations} />
          </aside>
          <div className="hidden flex-1 items-center justify-center p-8 text-center md:flex">
            <div>
              <h2 className="font-medium">Keine Konversation ausgewählt</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Wähle eine Konversation aus der Liste aus, um Nachrichten zu
                lesen und zu senden.
              </p>
            </div>
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
