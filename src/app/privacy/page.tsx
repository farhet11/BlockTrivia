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
        <h1 className="font-heading text-3xl font-semibold mb-8">Privacy Policy</h1>

        <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Introduction</h2>
            <p>
              BlockTrivia ("we," "us," "our," or "Company") is committed to protecting your privacy. This Privacy Policy explains how we
              collect, use, disclose, and otherwise process personal information in connection with our website, mobile applications, and
              services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Information We Collect</h2>
            <p>We collect information you provide directly to us, including:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Account Information:</strong> Email address, display name, username, and other profile information
              </li>
              <li>
                <strong>Authentication Data:</strong> Information from third-party authentication providers (Google, Telegram)
              </li>
              <li>
                <strong>Game Data:</strong> Scores, rankings, answers, and performance metrics from trivia games
              </li>
              <li>
                <strong>Communications:</strong> Messages, feedback, and support requests you send to us
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Automatically Collected Information</h2>
            <p>
              When you use BlockTrivia, we automatically collect certain information about your device and usage patterns, including:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>IP address and device identifiers</li>
              <li>Browser type and operating system</li>
              <li>Pages visited and time spent on the platform</li>
              <li>Referring and exit pages</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and send related information</li>
              <li>Send promotional communications (with your consent)</li>
              <li>Respond to your inquiries and customer support requests</li>
              <li>Comply with legal obligations</li>
              <li>Prevent fraud and ensure security</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Information Sharing</h2>
            <p>
              We do not sell, trade, or rent your personal information to third parties. We may share information with service providers who
              assist us in operating our website and providing services, subject to confidentiality agreements. We may also disclose information
              when required by law or to protect our rights and safety.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Data Security</h2>
            <p>
              BlockTrivia implements appropriate technical and organizational measures to protect your personal information against
              unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure,
              and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Your Rights</h2>
            <p>
              Depending on your location, you may have the right to access, correct, delete, or port your personal information. To exercise
              these rights, please contact us at the email address provided below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Cookies and Tracking</h2>
            <p>
              BlockTrivia uses cookies and similar tracking technologies to enhance your experience. You can control cookie settings through
              your browser preferences.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Children's Privacy</h2>
            <p>
              BlockTrivia is not directed to children under the age of 13. We do not knowingly collect personal information from children
              under 13. If we learn that we have collected such information, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices or for other operational, legal, or
              regulatory reasons. We will notify you of material changes by posting the updated policy on our website.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or our privacy practices, please contact us at{" "}
              <a href="mailto:support@blocktrivia.xyz" className="text-primary hover:text-primary/80 transition-colors">
                support@blocktrivia.xyz
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <GlobalFooter />
    </div>
  );
}
