import { Label } from "@/components/editorial";
import { TenantProviders } from "@/components/tenant/providers";
import { publicPrivyAppId, tenantConfigured } from "@/lib/tenant/env";

/**
 * The shell for the screens a trader uses on their own account.
 *
 * On a host where sign-in has not been set up this renders one honest notice and no
 * screen at all. That is deliberate: a login button that cannot work is worse than a
 * sentence saying it is not configured yet.
 */
export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const status = tenantConfigured();
  const appId = publicPrivyAppId();

  if (!status.signIn || appId === null) {
    return <NotConfigured missing={status.missing} />;
  }

  return <TenantProviders appId={appId}>{children}</TenantProviders>;
}

function NotConfigured({ missing }: { missing: string[] }) {
  return (
    <main className="relative px-6 pb-28 pt-[30svh] md:px-[5vw] md:pb-40 md:pt-[26svh]">
      <Label>your own account</Label>
      <h1 className="mt-5 max-w-[16ch] font-display text-[clamp(2.2rem,6vw,4.4rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-bone">
        Sign-in is not set up
        <span className="block font-light italic text-bone/85">on this host.</span>
      </h1>
      <p className="mt-8 max-w-[56ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
        The account area needs a few settings before anybody can sign in and connect a key. The
        rest of the desk runs without them: the shelf, the patterns, the checklist, the gate and
        the ask are all live on the published record.
      </p>
      <Label className="mt-10">still to set</Label>
      <ul className="mt-4 flex flex-col gap-2 font-mono text-[12px] break-all text-bone/70">
        {missing.map((name) => (
          <li key={name} className="border-l border-dawn/50 pl-4">
            {name}
          </li>
        ))}
      </ul>
      <p className="mt-10 max-w-[56ch] font-body text-[1rem] font-light leading-[1.6] text-bone/55">
        They go in the environment of whoever runs this site. The names and what each one is for
        are in .env.example at the top of the repository.
      </p>
    </main>
  );
}
