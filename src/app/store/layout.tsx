import ClientPage from "@/components/ClientPage";
import StoreHeader from "@/components/StoreHeader";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ClientPage>
        <StoreHeader />
      </ClientPage>
      <ClientPage>{children}</ClientPage>
    </div>
  );
}
