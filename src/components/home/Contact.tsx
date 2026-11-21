import { SITE } from "@/lib/site";

export function Contact() {
  return (
    <section id="contact" className="section container" aria-labelledby="contact-title">
      <h2 id="contact-title" className="reveal">
        연락처
      </h2>
      <p className="cmd mono" data-cmd="$ cat MAINTAINERS">
        $ cat MAINTAINERS
      </p>
      <pre className="maint mono orbit reveal">
        {"INSURANCE IT SYSTEMS\n"}
        <span className="k">M:</span>
        {`  ${SITE.name} <`}
        <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        {">\n"}
        <span className="k">S:</span>
        {"  Maintained\n"}
        <span className="k">F:</span>
        {"  contract/  channel-cm/  tm/  interface/  batch/"}
      </pre>
    </section>
  );
}
