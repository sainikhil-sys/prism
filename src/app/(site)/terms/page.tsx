import type { Metadata } from "next";
import { ContactLine, LegalPage, Missing, operatorName } from "@/components/site/legal";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "The terms that apply when you use Prism.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const op = operatorName();
  return (
    <LegalPage title="Terms and Conditions">
      <section>
        <h2>1. About these terms</h2>
        <p>
          These terms are an agreement between you and <Missing value={site.operator.legalName} label="Legal name of the operator" /> (&quot;we&quot;, &quot;us&quot;), the operator of Prism. By creating an account or using Prism you accept them. If you use Prism on behalf of a business, you confirm you can bind that business to these terms.
        </p>
      </section>

      <section>
        <h2>2. The service</h2>
        <p>
          Prism is software for importing product and sales data, forecasting demand, generating price recommendations within rules you set, explaining those recommendations, and recording decisions about them. Prism does not connect to or change prices in your store, website or other systems. Approving a recommendation only updates the price recorded in Prism.
        </p>
      </section>

      <section>
        <h2>3. Forecasts and recommendations are estimates</h2>
        <p>
          Forecasts, recommendations, estimated revenue or margin, and explanations are produced by statistical models from the data you provide. They depend on that data being accurate and complete, they rely on assumptions shown with each result, and they describe correlations in historical data rather than proven causes. They may be wrong. You remain responsible for your pricing and inventory decisions and for complying with laws that apply to them, including consumer protection and competition laws.
        </p>
      </section>

      <section>
        <h2>4. Accounts</h2>
        <ul>
          <li>You must give accurate information and keep your password confidential.</li>
          <li>You are responsible for activity under your account and for the members you invite to your organizations and the roles you give them.</li>
          <li>Tell us promptly at <ContactLine /> if you believe your account has been compromised.</li>
        </ul>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>upload data you have no right to use, or personal data about your customers;</li>
          <li>use Prism for anything unlawful, including coordinating prices with competitors;</li>
          <li>try to access other organizations&apos; data, probe or bypass security controls, or disrupt the service;</li>
          <li>overload the service with automated requests beyond normal use, or resell access without our written permission.</li>
        </ul>
      </section>

      <section>
        <h2>6. Your data</h2>
        <p>
          Your organization keeps all rights in the data it uploads. You give us permission to store and process that data only to provide Prism to you, to secure and maintain the service, and as required by law. Our <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a> explains how we handle personal data. You can delete your organization&apos;s data by deleting the organization.
        </p>
      </section>

      <section>
        <h2>7. Fees</h2>
        <p>
          Prism does not currently charge fees. If we introduce paid plans, we will show the price and terms before you are asked to pay, and nothing will be charged without your agreement.
        </p>
      </section>

      <section>
        <h2>8. Our intellectual property</h2>
        <p>Prism&apos;s software, design and content belong to {op} or its licensors. These terms give you a limited, non-transferable right to use Prism while your account is active.</p>
      </section>

      <section>
        <h2>9. Availability and changes</h2>
        <p>
          We work to keep Prism available and secure but do not promise uninterrupted service. We may change or discontinue features. If we intend to shut Prism down, we will give reasonable notice so you can export or remove your data.
        </p>
      </section>

      <section>
        <h2>10. Ending your use</h2>
        <p>
          You can stop using Prism and delete your account at any time. We may suspend or close accounts that break these terms or put the service or other users at risk, and will tell you why unless the law prevents it.
        </p>
      </section>

      <section>
        <h2>11. Disclaimers and liability</h2>
        <p>
          To the extent the law allows, Prism is provided &quot;as is&quot; without warranties of any kind, and we are not liable for indirect or consequential losses, or for lost profits, revenue or business resulting from decisions made using Prism. Nothing in these terms limits liability that cannot be limited by law, such as liability for fraud or for death or personal injury caused by negligence.
        </p>
      </section>

      <section>
        <h2>12. Governing law</h2>
        <p>
          These terms are governed by <Missing value={site.operator.jurisdiction} label="Governing law and courts" />. If you are a consumer, you keep any protections given by the laws of the country where you live.
        </p>
      </section>

      <section>
        <h2>13. Changes to these terms</h2>
        <p>We may update these terms. We will change the date at the top and notify account holders before significant changes take effect. Continuing to use Prism after that means you accept the updated terms.</p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          Questions about these terms: <ContactLine />.
        </p>
      </section>
    </LegalPage>
  );
}
