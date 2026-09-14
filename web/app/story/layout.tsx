import { Footer } from "@/components/footer";
import { kaavalUrl } from "@/lib/story";

/**
 * The story page is the only screen that ends in a footer, because it is the only one a
 * stranger reads from top to bottom. The rest of the desk is a reference you arrive in
 * the middle of.
 */
export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="px-6 pb-28 md:px-[5vw] md:pb-20">
        <Footer kaaval={kaavalUrl()} />
      </div>
    </>
  );
}
