import { getAllSettingStatuses } from "@/lib/settings";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getAllSettingStatuses();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Changes save to this app&apos;s database and take effect immediately — no
          restart needed, except where noted below.
        </p>
      </div>
      <SettingsForm initialSettings={settings} />
    </main>
  );
}
