import { GlobalNav } from "@/app/_components/global-nav";
import { GlobalFooter } from "@/app/_components/global-footer";

export const metadata = {
  title: "Terms of Service | BlockTrivia",
  description: "Terms of Service for BlockTrivia",
};

export default function TermsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <GlobalNav />
      <main className="flex-1 max-w-3xl mx-auto w-full px-8 py-16">
        <h1 className="font-heading text-3xl font-semibold mb-8">Terms of Service</h1>

        <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing and using BlockTrivia, you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Use License</h2>
            <p>
              Permission is granted to temporarily download one copy of the materials (information or software) on BlockTrivia for personal,
              non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may
              not:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Modifying or copying the materials</li>
              <li>Using the materials for any commercial purpose or for any public display</li>
              <li>Attempting to decompile or reverse engineer any software</li>
              <li>Removing any copyright or other proprietary notations from the materials</li>
              <li>Transferring the materials to another person or "mirroring" the materials on any other server</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Disclaimer</h2>
            <p>
              The materials on BlockTrivia are provided on an 'as is' basis. BlockTrivia makes no warranties, expressed or implied, and hereby
              disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability,
              fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Limitations</h2>
            <p>
              In no event shall BlockTrivia or its suppliers be liable for any damages (including, without limitation, damages for loss of
              data or profit, or due to business interruption) arising out of the use or inability to use the materials on BlockTrivia, even
              if BlockTrivia or a BlockTrivia authorized representative has been notified orally or in writing of the possibility of such damage.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Accuracy of Materials</h2>
            <p>
              The materials appearing on BlockTrivia could include technical, typographical, or photographic errors. BlockTrivia does not
              warrant that any of the materials on its website are accurate, complete, or current. BlockTrivia may make changes to the
              materials contained on its website at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Links</h2>
            <p>
              BlockTrivia has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked
              site. The inclusion of any link does not imply endorsement by BlockTrivia of the site. Use of any such linked website is at the
              user's own risk.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Modifications</h2>
            <p>
              BlockTrivia may revise these terms of service for its website at any time without notice. By using this website, you are agreeing
              to be bound by the then current version of these terms of service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Governing Law</h2>
            <p>
              These terms and conditions are governed by and construed in accordance with the laws of the jurisdiction in which BlockTrivia
              operates, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
            </p>
          </section>
        </div>
      </main>
      <GlobalFooter />
    </div>
  );
}
