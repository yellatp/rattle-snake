/**
 * Baseline role screening checklists, derived from Tsenta's published recruiter
 * checklists (headlessheadhunter.org method).
 *
 * IMPORTANT: these are ENTRY-LEVEL FLOORS, not ceilings. The posting itself and
 * the candidate's seniority raise the bar. Committees and the resume auditor
 * must treat them as the minimum bar only: "minimum expected, then scale up."
 *
 * Every item is framed as a QUALIFICATION (WHAT + HOW + WHY + WHERE), not a
 * bare keyword: a tool listed only in the Skills block without a bullet that
 * proves WHERE it was used does not count.
 */

export const SCREENING_CHECKLISTS: Record<string, string[]> = {
  swe: [
    "Degree",
    "TypeScript, JavaScript, HTML, CSS",
    "REST API or RESTful API",
    "SQL",
    "Cloud (AWS, GCP, or Azure)",
    "Back end (Python, C#/.NET, or Java)",
    "React or React Native",
    "Git or GitHub",
    "CI/CD",
    "Agile / Scrum",
    "Communicated with designers and product managers about what is feasible and what is not",
  ],
  ai_engineer: [
    "Degree",
    "Python",
    "Machine learning and LLMs",
    "Cloud (GCP, Azure, or AWS)",
    "Built and shipped something in production",
    "Agentic systems / multi-agent",
    "Agentic coding tools (Claude Code, OpenAI Codex, Cursor)",
    "Agent frameworks (LangGraph, LangChain, Google ADK, OpenAI Agent SDK)",
    "MLOps (deployment, evaluation, monitoring)",
    "Communicated technical details to a non-technical audience",
    "Git, SQL, RAG, NumPy",
  ],
  ai_analyst: [
    "Degree",
    "LLM, AI/ML/NLP",
    "PyTorch or TensorFlow",
    "Python",
    "Cloud",
    "Hugging Face",
    "Company-specific domain (chatbot, industry, UI/UX)",
  ],
  ai_specialist: [
    "Degree",
    "AI/ML/NLP fundamentals",
    "LLMs and prompt engineering",
    "Python",
    "Cloud",
    "Hugging Face",
    "Domain-specific application (industry, chatbot, UI/UX)",
  ],
  bi_analyst: [
    "Degree",
    "SQL",
    "ETL / data warehouse",
    "Data visualization (Tableau, Power BI, QlikView)",
    "Excel and MS Office",
    "Explained complex topics to customers/stakeholders",
    "Industry-specific context",
  ],
  business_analyst: [
    "Degree",
    "SQL",
    "Microsoft 365 (Excel advanced, PowerPoint, Outlook, Word)",
    "JIRA, SAP",
    "Requirements gathering and documentation",
    "Influenced cross-functional stakeholders from IC to management",
    "Explained complex topics to non-technical audiences",
    "Met multiple deadlines concurrently",
    "Agile, Scrum, Waterfall",
  ],
  business_strategist: [
    "Degree",
    "Financial and market analysis",
    "Excel financial modeling, PowerPoint",
    "Industry context",
    "Influenced stakeholders and senior leadership",
    "Explained strategy to non-technical audiences",
    "Cross-functional collaboration",
  ],
  cloud_engineer: [
    "Degree",
    "AWS or Azure (EC2, VPC, IAM, S3 equivalent)",
    "Python or Bash / shell scripting",
    "CI/CD",
    "Linux",
    "Infrastructure as Code (Terraform, CloudFormation, or Bicep)",
    "Monitoring (CloudWatch, Datadog, or similar)",
    "Kubernetes or Docker",
    "Explained complex topics to non-technical stakeholders",
    "Troubleshooting, monitoring, and optimizing cloud environments",
  ],
  cloud_security_engineer: [
    "Degree",
    "Python, PowerShell",
    "Firewalls, IDS/IPS, SIEM, vulnerability management",
    "Network protocols and systems (WAN/LAN, Active Directory)",
    "Compliance frameworks (SOC2, PCI-DSS, NIST, CIS, ISO)",
    "Security operations and incident response",
    "Explained complex topics to non-technical stakeholders",
    "Certifications (CISSP, CISM, CEH, CompTIA Security+)",
  ],
  computer_vision_engineer: [
    "Degree",
    "Machine learning",
    "Python",
    "PyTorch or TensorFlow",
    "OpenCV",
    "Cloud",
    "CI/CD",
    "Git",
    "SQL",
    "Scale of the systems built",
    "Communicated technical details to non-technical people",
  ],
  cybersecurity_analyst: [
    "Degree",
    "Industry and clearance context (DoD, Military, ISO, HIPAA)",
    "Certifications (CompTIA Security+, CEH, CISSP, OSCP, GIAC)",
    "Python",
    "SIEM tools",
    "Threat detection and incident response",
    "Communicated security risks clearly to non-technical stakeholders",
    "MITRE ATT&CK or cloud security",
  ],
  data_analyst: [
    "Degree",
    "Industry",
    "SQL",
    "Data visualization (Tableau, Power BI, Looker)",
    "Influenced stakeholders",
    "Explained technical concepts to non-technical stakeholders",
    "Solved a problem with data (not just what the data is)",
    "Excel (macros, pivot tables, VLOOKUP)",
    "Python or R",
  ],
  data_architect: [
    "Degree",
    "SQL",
    "Data modeling",
    "Cloud + object storage (S3 or equivalent)",
    "ETL/ELT",
    "Databases (MongoDB, SQL Server, PostgreSQL)",
    "Big data (Kafka, Spark, Hadoop)",
    "Git",
    "Managed and communicated data plans to non-technical audiences",
    "Met multiple deadlines",
  ],
  data_engineer: [
    "Python",
    "ETL/ELT",
    "SQL",
    "Cloud + S3 (or equivalent)",
    "Data models, lakes, or warehouses",
    "Managed and communicated data plans to non-technical audiences",
    "Met multiple deadlines",
    "Big data (Kafka, Spark, Hadoop)",
    "Git",
    "SDLC",
  ],
  data_platform_engineer: [
    "Degree",
    "SQL",
    "Databricks, PySpark",
    "Data engineering",
    "Python",
    "Cloud",
    "BI tools / data visualization (Tableau, Looker, Power BI)",
    "CI/CD",
    "Database management systems (MongoDB, SQL Server)",
    "Collaborated with both technical and non-technical stakeholders",
    "ETL/ELT, R, data governance",
  ],
  data_scientist: [
    "Degree",
    "Python or R",
    "SQL",
    "Industry context",
    "Explained results to non-technical folks",
    "Influenced stakeholders",
    "Cross-functional collaboration",
    "ML Ops",
    "Dashboards / data visualization (Power BI)",
    "Machine learning across data forms (modeling, analytics)",
  ],
  devops: [
    "DevOps, Cloud, and its words (EC2)",
    "CI/CD, GitHub Actions",
    "Coding language (Python, Java, etc.), PowerShell, Bash",
    "Linux / Unix",
    "Infrastructure as Code",
    "Kubernetes, Docker, Terraform, Helm, Ansible",
    "Monitoring platforms (Prometheus, Grafana, DataDog)",
    "Troubleshooting",
    "SQL",
    "Network protocols, firewall management, and security",
  ],
  gtm_analyst: [
    "A/B testing, KPIs",
    "SEO, SQL",
    "Data analytics platforms (Tableau, Google Analytics, Power BI, Excel)",
    "Marketing platforms (TikTok, YouTube, Email)",
    "Industry",
    "Salesforce, HubSpot",
    "B2B, B2C, SaaS, CAC, LTV",
    "Cross-functional collaboration and stakeholder influence",
  ],
  marketing_analyst: [
    "Degree",
    "Data analytics and Excel",
    "A/B testing, KPIs",
    "SEO, SQL",
    "Data visualization (Tableau, Google Analytics, Power BI)",
    "Social media scheduling and analytics tools (HubSpot, Hootsuite)",
    "Cross-functional collaboration",
    "Influenced stakeholders",
  ],
  marketing_strategist: [
    "Degree",
    "B2B, SaaS/tech",
    "Content strategies across multiple formats (blogs, whitepapers, case studies, email, video, landing pages)",
    "Cross-functional / matrixed",
    "Brand voice, Canva, Figma",
    "Social media scheduling and analytics tools (HubSpot, Hootsuite, Mailchimp)",
    "Used data to succeed and measured impact",
    "Translated technical content for both technical and non-technical audiences",
  ],
  market_research_analyst: [
    "Degree",
    "Report writing",
    "Industry",
    "Presented findings to non-technical people",
    "Met deadlines and paid attention to detail",
    "Microsoft Office (Outlook, Excel, Word, PowerPoint)",
    "Research methodology",
  ],
  mlops_engineer: [
    "Degree",
    "Machine learning",
    "Python",
    "Cloud",
    "CI/CD",
    "Docker and Kubernetes",
    "Trained, tuned, and deployed models in production (0 to 1)",
    "ML frameworks (TensorFlow, PyTorch, scikit-learn)",
    "Git",
    "SQL",
    "Monitoring and evaluation of models",
  ],
  ml_engineer: [
    "Degree",
    "Machine learning",
    "Cloud",
    "CI/CD",
    "Databricks",
    "Git",
    "SQL",
    "Python (Java/C#/.NET)",
    "Cross-functional collaboration",
    "Communicated technical details to non-technical people",
    "ML frameworks (TensorFlow, PyTorch, scikit-learn, Pandas, NumPy)",
    "Scale of the systems built",
    "Trained, tuned, and deployed models in production (0 to 1)",
  ],
  nlp_engineer: [
    "Degree",
    "NLP",
    "Python",
    "PyTorch or TensorFlow",
    "LLMs and RAG",
    "Hugging Face",
    "Git",
    "Cloud",
    "Communicated technical details to non-technical people",
  ],
  operations_analyst: [
    "Degree",
    "MS Office (Excel advanced, Word, Outlook)",
    "Data analysis",
    "Stakeholder management",
    "Met deadlines",
    "Process and operations improvement",
    "Cross-functional collaboration",
    "Industry",
  ],
  penetration_tester: [
    "Degree",
    "Security certifications (OSCP, CompTIA Security+, CEH)",
    "Kali Linux",
    "OWASP top 10",
    "Web and mobile application testing",
    "Vulnerability assessment and exploitation",
    "Report writing",
    "Communicated findings to non-technical stakeholders",
  ],
  pricing_analyst: [
    "Degree",
    "Excel financial modeling",
    "SQL or Python",
    "Statistical analytics and data mining",
    "Industry",
    "Explained technical details to non-technical people",
    "Multitasked and met tight deadlines",
    "Influenced or managed stakeholders",
  ],
  product_analyst: [
    "Degree",
    "SQL",
    "Data analysis",
    "Dashboards and data visualization",
    "A/B testing and product metrics",
    "JIRA",
    "Cross-functional collaboration",
    "Influenced stakeholders",
    "Agile",
  ],
  product_manager: [
    "Degree",
    "Agile, JIRA",
    "Industry",
    "Product delivery, project ownership, or technical product",
    "Cross-functional collaboration",
    "Influenced internal and external stakeholders",
    "Multitasking",
    "Explained how and why decisions were made",
    "Technical product understanding",
  ],
  qa_engineer: [
    "Degree",
    "Test automation",
    "SDLC",
    "CI/CD",
    "SQL",
    "API testing",
    "Bug tracking (JIRA)",
    "Scripting (Python, Java, or JavaScript)",
    "Agile / Scrum",
    "Attention to detail",
  ],
  research_scientist: [
    "Degree (PhD or Masters)",
    "Understanding of industry processes",
    "Basic industry tools",
    "Microsoft Office Suite",
    "Worked cross-functionally",
    "Troubleshooting",
    "Read documents, schedules, and manuals",
    "Communicated findings to non-technical audiences",
  ],
  soc_analyst: [
    "Degree",
    "Cybersecurity, SOC, NOC",
    "Certifications (CompTIA, cloud)",
    "Troubleshooting / diagnostic",
    "PowerShell, Python",
    "SIEM",
    "Intrusion detection & prevention (IDS/IPS)",
    "Firewalls and log analysis",
    "Security analysis, malware investigations, forensic methodologies",
    "NIST incident response",
    "Diamond Model",
  ],
};

/** Baseline screening checklist for a role slug (empty if unknown). */
export function getScreeningChecklist(slug: string): string[] {
  return SCREENING_CHECKLISTS[slug] ?? [];
}

const STOPWORDS = new Set([
  "and", "or", "the", "a", "an", "with", "for", "to", "of", "in", "on", "its",
  "etc", "any", "not", "but", "into", "from", "basic", "nice", "have", "like",
]);

/**
 * Extract the significant keywords of a checklist item so we can scan a resume
 * for evidence of it. Splits on commas, slashes, and parentheses.
 *
 * Example: "SQL, data visualization (Tableau, Power BI, Looker)"
 *   -> ["sql", "tableau", "power bi", "looker"]
 */
export function checklistKeywords(item: string): string[] {
  return item
    .replace(/[()]/g, " ")
    .split(/[,/]|\s+or\s+/i)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => {
      if (part.length < 3) return false;
      const tokens = part.split(/\s+/);
      return tokens.some((t) => t.length >= 3 && !STOPWORDS.has(t));
    });
}

export interface ScreeningAuditResult {
  /** Checklist items with no supporting keyword anywhere in the resume text. */
  missing: string[];
  matched: number;
  total: number;
}

/**
 * Deterministic screening-coverage audit: for each checklist item, do any of its
 * keywords appear in the resume text? Items with zero keyword evidence are
 * reported as "not evidenced" so the regeneration loop can fix them. This is a
 * FLOOR check (report-only) — absence is advisory, not a hard fail, because the
 * posting and seniority raise the bar.
 */
export function auditScreening(resumeText: string, checklist: string[]): ScreeningAuditResult {
  const missing: string[] = [];
  let matched = 0;
  const text = resumeText.toLowerCase();

  for (const item of checklist) {
    const keywords = checklistKeywords(item);
    if (keywords.length === 0) continue;
    // A keyword counts as evidenced if ANY significant token of it appears in
    // the resume ("cloud aws" -> "aws" matches; "power bi" -> "power" matches).
    const hit = keywords.some((kw) => {
      const tokens = kw.split(/\s+/);
      return tokens.some((t) => t.length >= 3 && text.includes(t));
    });
    if (hit) matched += 1;
    else missing.push(item);
  }

  return { missing, matched, total: checklist.length };
}
