import { SettingsNav } from "@/components/app/settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/app/settings">) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>
      <SettingsNav />
      {children}
    </div>
  );
}
