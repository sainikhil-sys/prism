import type { Metadata } from "next";
import { ContactLine, LegalPage, Missing, operatorName } from "@/components/site/legal";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal data Prism collects, why, who processes it, how long it is kept and your rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const op = operatorName();
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <h2>Who we are</h2>
        <p>
          Prism is operated by <Missing value={site.operator.legalName} label="Legal name of the operator" />, <Missing value={site.operator.address} label="Registered address" /> (&quot;we&quot;, &quot;us&quot;). We are responsible for the personal data described in this policy. Contact us about privacy at <ContactLine />.
        </p>
      </section>

      <section>
        <h2>What we collect and why</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Why we use it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account details: your name, email address and a hashed password (we never store your password itself)</td>
              <td>To create your account, sign you in, and send password reset emails you request.</td>
            </tr>
            <tr>
              <td>Session records: the IP address and browser user agent of each signed-in session</td>
              <td>To keep you signed in and to help detect misuse of accounts.</td>
            </tr>
            <tr>
              <td>IP addresses used for rate limiting</td>
              <td>To limit repeated sign-in, sign-up and password reset attempts.</td>
            </tr>
            <tr>
              <td>Organization and membership details: organization name, settings, your role and invitations you send (including the invitee&apos;s email)</td>
              <td>To let teams share data and control who can do what.</td>
            </tr>
            <tr>
              <td>Business data you upload: products, costs, prices, stock levels, sales records and competitor price observations</td>
              <td>To provide forecasts, recommendations and analytics to your organization. This data belongs to your organization.</td>
            </tr>
            <tr>
              <td>Activity records: an audit log of imports, edits, policy changes and pricing decisions, linked to the member who made them</td>
              <td>So organizations can see who changed what, and to investigate problems.</td>
            </tr>
            <tr>
              <td>Contact form messages: your name, email, company (optional), topic and message, plus a one-way hash of your IP address</td>
              <td>To reply to you and to block abuse of the form. We do not store your raw IP address with your message.</td>
            </tr>
            <tr id="analytics">
              <td>Usage analytics, only if you accept analytics: pages viewed, device and browser information and coarse events such as &quot;forecast generated&quot;</td>
              <td>To understand how the site is used and improve it. We do not send your name, email, business data or prices to analytics.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Please do not upload personal data about your own customers. Prism does not need it: sales records only require a product, date, quantity and price.
        </p>
      </section>

      <section>
        <h2>Legal bases</h2>
        <p>
          Where data protection laws such as the GDPR apply, we rely on: performance of our contract with you for account, organization and business data; our legitimate interests in securing the service, preventing abuse and keeping audit records; and your consent for analytics, which you can withdraw at any time.
        </p>
      </section>

      <section>
        <h2>Cookies and similar technologies</h2>
        <ul>
          <li>
            <strong>Session cookie</strong> (essential): keeps you signed in. Set when you sign in and removed when you sign out or the session expires.
          </li>
          <li>
            <strong>Active organization cookie</strong> (<code>prism_org</code>, essential): remembers which organization you were working in.
          </li>
          <li>
            <strong>Analytics choice</strong> (stored in your browser&apos;s local storage): remembers whether you accepted or declined analytics.
          </li>
          <li>
            <strong>Google Analytics cookies</strong> (<code>_ga</code> and similar): set only if analytics is enabled on this site and you accept it.
          </li>
        </ul>
        <p>Fonts are served from our own domain, so loading a page does not contact a font provider.</p>
      </section>

      <section>
        <h2>Who processes your data</h2>
        <p>We use these service providers to run Prism. They process data on our behalf:</p>
        <ul>
          <li>Vercel: hosting of the website and application.</li>
          <li>
            <Missing value={site.databaseProvider} label="Database provider" />: managed PostgreSQL database storing account, organization and business data.
          </li>
          <li>Resend: sending password reset emails and contact form notifications, when email is enabled.</li>
          <li>Google (Google Analytics 4): usage analytics, only with your consent.</li>
        </ul>
        <p>
          Our providers may store data in <Missing value={site.dataRegions} label="Data storage regions" />. Where data leaves your country, we rely on the safeguards our providers offer, such as standard contractual clauses.
        </p>
        <p>We do not sell personal data, and we do not use your business data to train models for other customers. Forecasting and explanations run inside Prism; your sales data is not sent to an external AI or machine learning service.</p>
      </section>

      <section>
        <h2>How long we keep data</h2>
        <ul>
          <li>Account data: until you delete your account. You can do this yourself under Settings, Your account.</li>
          <li>Sessions: expire after 7 days without activity, and are deleted when you delete your account.</li>
          <li>Organization and business data: until an owner deletes the organization, or until the last member deletes their account.</li>
          <li>Audit log entries: kept with the organization. If you delete your account, entries remain but no longer identify you.</li>
          <li>Contact form messages: Prism does not yet delete these automatically; {op} keeps them only as long as needed to handle your enquiry and deletes them on request.</li>
          <li>Analytics data: kept according to the retention setting of our Google Analytics property.</li>
        </ul>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Connections use HTTPS. Passwords are hashed with scrypt. Access to business data is checked on the server for every request and limited to members of the organization that owns it. No system is perfectly secure; read more on our <a href="/security" className="underline underline-offset-2">security page</a>.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          Depending on where you live, you may have the right to access, correct, delete or receive a copy of your personal data, to object to or restrict certain processing, and to withdraw consent. You can delete your account in the app, change your analytics choice from the site footer, and make any other request at <ContactLine />. You may also complain to your local data protection authority.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>Prism is a business tool and is not intended for anyone under 16.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>We will update the date at the top of this page when this policy changes, and notify account holders before significant changes take effect.</p>
      </section>
    </LegalPage>
  );
}
