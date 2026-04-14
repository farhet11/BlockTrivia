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
        <h1 className="font-heading text-3xl font-semibold mb-2">Terms of Service</h1>
        <p className="text-xs text-muted-foreground mb-8">
          <strong>Effective Date:</strong> [INSERT DATE] | <strong>Last Updated:</strong> April 2026
        </p>

        <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section>
            <p>
              {'These Terms of Service ("Terms") govern your use of BlockTrivia ("we," "us," or "our"), including our website at blocktrivia.com, our Telegram bot, and any events or games hosted on our platform.'}
            </p>
            <p className="mt-3">{"By using BlockTrivia, you agree to these Terms. If you don't agree, don't use the platform."}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">1. Who Can Use BlockTrivia</h2>
            <p>
              You must be at least 13 years old (16 in the EU) to use BlockTrivia. You may use BlockTrivia as a Player
              (participating in games), a Host (creating and running events), or a Guest (joining without an account).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">2. Your Account</h2>

            <h3 className="font-semibold text-foreground mt-5 mb-2">2.1 Creating an Account</h3>
            <p>
              You can sign in using Google, Email, or Telegram. You are responsible for keeping your account secure and
              for all activity that occurs under your account.
            </p>

            <h3 className="font-semibold text-foreground mt-5 mb-2">2.2 Accurate Information</h3>
            <p>{"You agree to provide accurate information when setting up your account. Don't impersonate other people or create misleading display names."}</p>

            <h3 className="font-semibold text-foreground mt-5 mb-2">2.3 One Account Per Person</h3>
            <p>Each person may maintain one account. Creating multiple accounts to gain competitive advantages or circumvent bans is prohibited.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">3. Acceptable Use</h2>
            <p>You agree to use BlockTrivia in good faith. You may not:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Cheat, manipulate scores, or exploit platform bugs for competitive advantage</li>
              <li>Use bots, scripts, or automated tools to play games or farm reputation scores</li>
              <li>Attempt to reverse-engineer, scrape, or extract data from the platform</li>
              <li>Harass, threaten, or abuse other players or hosts</li>
              <li>Distribute spam, malware, or illegal content</li>
              <li>Use the platform in any way that violates applicable laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">4. Fair Play & Anti-Cheating</h2>
            <p>BlockTrivia is a knowledge platform. Its value depends on results being real.</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>
                <strong>Automated assistance is prohibited.</strong> Using AI tools, scripts, or external lookup tools
                during live gameplay is cheating.
              </li>
              <li>
                <strong>Collusion is prohibited.</strong> Coordinating answers with other players during a live game to
                gain an unfair advantage is prohibited.
              </li>
              <li>
                <strong>Score manipulation is prohibited.</strong> Any attempt to artificially inflate your reputation
                score will result in score invalidation and account suspension.
              </li>
            </ul>
            <p className="mt-3">
              We reserve the right to investigate suspicious gameplay patterns and take action, including resetting
              scores or terminating accounts, without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">5. Hosts: Your Responsibilities</h2>
            <p>If you use BlockTrivia to host events, you agree that:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>
                You are responsible for the questions you create or upload, and for ensuring they do not infringe
                third-party intellectual property rights
              </li>
              <li>You will not use BlockTrivia to deceive, mislead, or manipulate participants</li>
              <li>
                You will handle participant data you receive responsibly and in accordance with our Privacy Policy and
                applicable law
              </li>
              <li>You are responsible for obtaining any necessary consents from your participants</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">6. Reputation Scores</h2>
            <p>Your BlockTrivia reputation score is a record of your knowledge performance across events. It is:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>
                <strong>Owned and operated by BlockTrivia</strong> — it exists within our system and may change as scoring
                methodology evolves
              </li>
              <li>
                <strong>Not guaranteed to persist indefinitely</strong> — we reserve the right to adjust, recalibrate, or
                reset scores if necessary
              </li>
              <li>
                <strong>Not transferable</strong> — your score is tied to your account and cannot be transferred to another user
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">7. Intellectual Property</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                <strong>{"BlockTrivia's IP:"}</strong> All platform code, design, branding, and content created by BlockTrivia is
                owned by us
              </li>
              <li>
                <strong>Your content:</strong> You retain ownership of content you submit, but grant BlockTrivia a
                non-exclusive license to use it to provide the service
              </li>
              <li>
              <strong>Community-generated trivia:</strong> {"Questions created by hosts within the platform are the host's intellectual property"}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">8. Termination</h2>
            <p>We may suspend or terminate your account if:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>You violate these Terms</li>
              <li>Your account is involved in fraud, abuse, or cheating</li>
              <li>We discontinue the service</li>
            </ul>
            <p className="mt-3">
              You may delete your account at any time. If your account is terminated for violations, you may not create
              a new account without our explicit permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">9. Disclaimers</h2>
            <p>{'BlockTrivia is provided "as is" and "as available." We make no warranties about:'}</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Uptime or availability (especially during live events on venue Wi-Fi)</li>
              <li>The accuracy of AI-generated questions</li>
              <li>The persistence or accuracy of reputation scores</li>
              <li>Fitness for any particular purpose</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">10. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, BlockTrivia shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages arising from your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">11. Changes to These Terms</h2>
            <p>
              {"We may update these Terms as the platform grows. We'll notify you of material changes via email or in-app notice. Continued use after changes constitutes acceptance."}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">12. Contact</h2>
            <p>
              For questions about these Terms, email{" "}
              <a href="mailto:support@blocktrivia.xyz" className="text-primary hover:text-primary/80">
                support@blocktrivia.xyz
              </a>
            </p>
          </section>
        </div>
      </main>
      <GlobalFooter />
    </div>
  );
}
