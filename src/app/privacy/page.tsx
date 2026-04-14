import { GlobalNav } from "@/app/_components/global-nav";
import { GlobalFooter } from "@/app/_components/global-footer";

export const metadata = {
  title: "Privacy Policy | BlockTrivia",
  description: "Privacy Policy for BlockTrivia",
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <GlobalNav />
      <main className="flex-1 max-w-3xl mx-auto w-full px-8 py-16">
        <h1 className="font-heading text-3xl font-semibold mb-2">Privacy Policy</h1>
        <p className="text-xs text-muted-foreground mb-8">
          <strong>Effective Date:</strong> [INSERT DATE] | <strong>Last Updated:</strong> April 2026
        </p>

        <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section>
            <p>
              {'This Privacy Policy explains how BlockTrivia ("we," "us," or "our") collects, uses, stores, and shares your information when you use our platform at blocktrivia.com, our Telegram bot, or participate in BlockTrivia events. By using BlockTrivia, you agree to the practices described in this policy.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">1. Who We Are</h2>
            <p>
              BlockTrivia is a real-time trivia platform that surfaces genuinely knowledgeable community members at live
              events and online. If you have questions about this policy, contact us at{" "}
              <a href="mailto:privacy@blocktrivia.xyz" className="text-primary hover:text-primary/80">
                privacy@blocktrivia.xyz
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">2. Information We Collect</h2>

            <h3 className="font-semibold text-foreground mt-5 mb-2">2.1 Account & Identity Information</h3>
            <p>When you create an account or join a game, we may collect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Display name — the name you choose to show publicly during gameplay</li>
              <li>Email address — collected via Google OAuth or direct email registration</li>
              <li>Profile avatar — auto-generated or chosen by you</li>
              <li>Telegram user ID and username — if you authenticate via Telegram Login</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-5 mb-2">2.2 Gameplay & Performance Data</h3>
            <p>When you play, we collect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Questions answered, answers selected, and correctness</li>
              <li>Response speed (time taken to answer)</li>
              <li>Score, accuracy rate, and event participation history</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-5 mb-2">2.3 Reputation Data</h3>
            <p>
              BlockTrivia maintains a cross-event reputation score that persists across games. This score reflects your
              cumulative gameplay performance and is designed to reflect genuine domain knowledge.
            </p>

            <h3 className="font-semibold text-foreground mt-5 mb-2">2.4 Technical Data</h3>
            <p>We automatically collect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>IP address and approximate location (country/city level)</li>
              <li>Device type, browser, and operating system</li>
              <li>Session identifiers and authentication tokens</li>
              <li>Usage logs (pages visited, actions taken)</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-5 mb-2">2.5 Data We Do NOT Collect</h3>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>We do not collect payment information directly</li>
              <li>We do not build advertising profiles or sell your data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Provide core gameplay features</li>
              <li>Maintain and display your reputation score</li>
              <li>Send event-related communications</li>
              <li>Improve the platform</li>
              <li>Share participant results with event organizers</li>
              <li>Prevent cheating and abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">4. Data Sharing</h2>

            <h3 className="font-semibold text-foreground mt-5 mb-2">4.1 Event Organizers</h3>
            <p>
              When you join a BlockTrivia game hosted by a third-party event organizer, your display name, score,
              ranking, and accuracy metrics may be shared with that organizer. By joining a game, you consent to your
              performance data being shared with the host.
            </p>

            <h3 className="font-semibold text-foreground mt-5 mb-2">4.2 Service Providers</h3>
            <p>We use third-party services for database hosting (Supabase), web hosting (Vercel), and authentication. All service providers are contractually required to protect your data.</p>

            <h3 className="font-semibold text-foreground mt-5 mb-2">4.3 What We Never Do</h3>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>We do not sell your personal data to third parties</li>
              <li>We do not share your data with advertisers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">5. Data Retention</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                <strong>Account data:</strong> Retained while your account is active; removed within 30 days if deleted
              </li>
              <li>
                <strong>Gameplay history:</strong> Retained to maintain your reputation score; anonymized upon deletion
              </li>
              <li>
                <strong>Technical logs:</strong> Retained for up to 90 days
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">6. Your Rights</h2>
            <p className="mt-3">All users have the right to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>
                <strong>Access:</strong> Request a copy of the data we hold about you
              </li>
              <li>
                <strong>Correction:</strong> Ask us to fix inaccurate information
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your account and personal data
              </li>
              <li>
                <strong>Opt-out:</strong> Opt out of non-essential communications
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{" "}
              <a href="mailto:privacy@blocktrivia.xyz" className="text-primary hover:text-primary/80">
                privacy@blocktrivia.xyz
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">7. Cookies & Tracking</h2>
            <p>BlockTrivia uses cookies and similar technologies for:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>
                <strong>Authentication:</strong> Session cookies to keep you logged in
              </li>
              <li>
                <strong>Security:</strong> Tokens to protect against attacks
              </li>
              <li>
                <strong>Preferences:</strong> Storing your light/dark mode setting and UI preferences
              </li>
            </ul>
            <p className="mt-3">We do not currently use advertising cookies or third-party tracking.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">{"8. Children's Privacy"}</h2>
            <p>
              BlockTrivia is not directed at children under the age of 13 (or 16 in the EU). We do not knowingly
              collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">9. Security</h2>
            <p>We implement industry-standard security measures including:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Encrypted data transmission (HTTPS / TLS)</li>
              <li>Secure authentication via established OAuth providers</li>
              <li>Access controls limiting who can access user data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">10. Changes to This Policy</h2>
            <p>
              {'We may update this policy as our product evolves. When we make material changes, we will update the "Last Updated" date above and notify you via email or in-app notice.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">11. Contact Us</h2>
            <p>
              For any privacy questions, data requests, or concerns, email{" "}
              <a href="mailto:privacy@blocktrivia.xyz" className="text-primary hover:text-primary/80">
                privacy@blocktrivia.xyz
              </a>
            </p>
          </section>
        </div>
      </main>
      <GlobalFooter />
    </div>
  );
}
