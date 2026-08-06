import { listPasskeys } from "@/lib/passkey";
import { Card, CardContent } from "@/components/ui/card";
import { PasskeyManager } from "./PasskeyManager";

export default async function AjustesPage() {
  const passkeys = await listPasskeys();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
      <Card>
        <CardContent className="py-6">
          <PasskeyManager passkeys={passkeys} />
        </CardContent>
      </Card>
    </div>
  );
}
