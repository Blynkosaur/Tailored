from playwright.sync_api import sync_playwright
import json
import re


def fetch_page_text(url: str, timeout: int = 30000) -> tuple[str, dict]:
    """Fetch fully rendered page and extract all visible text + JSON-LD data."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_default_timeout(timeout)
        
        # Navigate and wait for DOM to be ready
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        
        # Short wait for JS to render content
        page.wait_for_timeout(3000)
        
        # Get all visible text from the page
        visible_text = page.evaluate("""
            () => {
                // Get all text content, excluding scripts and styles
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: function(node) {
                            const parent = node.parentElement;
                            if (!parent) return NodeFilter.FILTER_REJECT;
                            
                            const tag = parent.tagName.toLowerCase();
                            if (['script', 'style', 'noscript', 'iframe'].includes(tag)) {
                                return NodeFilter.FILTER_REJECT;
                            }
                            
                            // Check if element is visible
                            const style = window.getComputedStyle(parent);
                            if (style.display === 'none' || style.visibility === 'hidden') {
                                return NodeFilter.FILTER_REJECT;
                            }
                            
                            return NodeFilter.FILTER_ACCEPT;
                        }
                    }
                );
                
                const textParts = [];
                while (walker.nextNode()) {
                    const text = walker.currentNode.textContent.trim();
                    if (text) textParts.push(text);
                }
                return textParts.join('\\n');
            }
        """)
        
        # Also try to get JSON-LD data for structured info (title, company, location)
        json_ld_data = {}
        try:
            json_ld_script = page.query_selector('script[type="application/ld+json"]')
            if json_ld_script:
                json_ld_data = json.loads(json_ld_script.inner_text())
        except:
            pass
        
        browser.close()
    
    return visible_text, json_ld_data


def clean_text(text: str) -> str:
    """Clean up text by removing extra whitespace."""
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_skills(text: str) -> list[str]:
    """Extract technical skills and technologies mentioned in the text."""
    skill_patterns = [
        r'\b(Python|Java|JavaScript|TypeScript|C\+\+|C#|Go|Golang|Rust|Ruby|PHP|Swift|Kotlin|Scala)\b',
        r'\b(React|Angular|Vue|Next\.js|Node\.js|Express|Django|Flask|FastAPI|Spring|\.NET|Rails)\b',
        r'\b(AWS|Amazon Web Services|Azure|GCP|Google Cloud|Docker|Kubernetes|K8s|Jenkins|CircleCI|GitHub Actions)\b',
        r'\b(SQL|MySQL|PostgreSQL|Postgres|MongoDB|Redis|Elasticsearch|DynamoDB|Cassandra|NoSQL)\b',
        r'\b(HTML|CSS|SASS|LESS|REST|RESTful|GraphQL|gRPC|API|APIs)\b',
        r'\b(Machine Learning|ML|AI|Artificial Intelligence|Deep Learning|NLP|Computer Vision)\b',
        r'\b(TensorFlow|PyTorch|Keras|scikit-learn|pandas|NumPy)\b',
        r'\b(Git|GitHub|GitLab|Bitbucket|SVN)\b',
        r'\b(Linux|Unix|Bash|Shell|PowerShell)\b',
        r'\b(Terraform|Ansible|Puppet|Chef|CloudFormation)\b',
        r'\b(Agile|Scrum|Kanban|CI/CD|DevOps|SRE)\b',
        r'\b(Kafka|RabbitMQ|SQS|Pub/Sub|Message Queue)\b',
        r'\b(Microservices|Distributed Systems|System Design)\b',
        r'\b(OAuth|JWT|SSL|TLS|Security|Authentication|Authorization)\b',
    ]
    
    skills = {}
    for pattern in skill_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            skill = match if isinstance(match, str) else match[0]
            # Normalize to avoid duplicates like "security" and "Security"
            skill_lower = skill.lower()
            if skill_lower not in skills:
                skills[skill_lower] = skill
    
    # Return deduplicated list, preferring the properly capitalized version
    return sorted(list(skills.values()), key=str.lower)


def parse_job_text(text: str) -> dict:
    """Parse job posting text to extract structured sections."""
    
    # Section header patterns (case insensitive)
    section_patterns = {
        "responsibilities": [
            r"(?:^|\n)\s*(?:key\s+)?responsibilities\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*what\s+you(?:'ll|[\s\-]+will)\s+(?:do|be doing)\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*your\s+(?:role|responsibilities)\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*(?:the|this)\s+role\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*about\s+the\s+(?:role|job|position)\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*job\s+description\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*as\s+a\s+.{0,50}you\s+will\s*[:\-]?\s*(?:\n|$)",
        ],
        "requirements": [
            r"(?:^|\n)\s*(?:minimum\s+)?(?:requirements|qualifications)\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*what\s+we(?:'re|\s+are)\s+looking\s+for\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*who\s+you\s+are\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*(?:required|preferred)\s+(?:skills|experience|qualifications)\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*you(?:'ll|\s+will)\s+(?:need|have|bring)\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*(?:basic|minimum)\s+qualifications\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*skills\s+(?:and|&)\s+(?:experience|qualifications)\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*what\s+you(?:'ll)?\s+(?:need|bring)\s*[:\-]?\s*(?:\n|$)",
        ],
        "preferred": [
            r"(?:^|\n)\s*(?:nice\s+to\s+have|preferred|bonus)\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*preferred\s+qualifications\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*it(?:'s|\s+is)\s+a\s+plus\s+if\s*[:\-]?\s*(?:\n|$)",
        ],
        "benefits": [
            r"(?:^|\n)\s*(?:benefits|perks|what\s+we\s+offer)\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*compensation\s+(?:and|&)\s+benefits\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*why\s+(?:join\s+us|work\s+(?:here|with\s+us))\s*[:\-]?\s*(?:\n|$)",
        ],
        "about_company": [
            r"(?:^|\n)\s*about\s+(?:us|the\s+company|.{1,30})\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*who\s+we\s+are\s*[:\-]?\s*(?:\n|$)",
            r"(?:^|\n)\s*company\s+(?:overview|description)\s*[:\-]?\s*(?:\n|$)",
        ],
    }
    
    # Find all section positions
    section_positions = []
    
    for section_type, patterns in section_patterns.items():
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE | re.MULTILINE):
                section_positions.append({
                    "type": section_type,
                    "start": match.end(),
                    "header_start": match.start(),
                    "header": match.group().strip()
                })
    
    # Sort by position
    section_positions.sort(key=lambda x: x["start"])
    
    # Extract content between sections
    sections = {
        "responsibilities": [],
        "requirements": [],
        "preferred": [],
        "benefits": [],
        "about_company": [],
    }
    
    for i, section in enumerate(section_positions):
        # Find end of this section (start of next section or end of text)
        if i + 1 < len(section_positions):
            end_pos = section_positions[i + 1]["header_start"]
        else:
            end_pos = len(text)
        
        content = text[section["start"]:end_pos].strip()
        
        # Split into lines/bullet points
        lines = re.split(r'\n|•|●|▪|◦|‣|⁃|\*\s+|–\s+|-\s+|\d+\.\s+', content)
        
        for line in lines:
            line = clean_text(line)
            if line and len(line) > 15:
                # Filter out junk
                line_lower = line.lower()
                if any(junk in line_lower for junk in [
                    "cookie", "privacy policy", "terms of", "copyright",
                    "all rights reserved", "sign in", "log in", "apply now",
                    "share this", "similar jobs", "back to", "openstreetmap",
                    "maptiler", "zoom the map", "two fingers", "oracle corporation",
                    "copy to clipboard", "legal notices", "carousel_paragraph",
                    "job_description.share", "get future jobs", "join our talent",
                    "careers loaded", "view more jobs", "leadership & governance",
                    "financial results", "regulatory information", "shareholder",
                    "annual general meeting", "privacy preference", "strictly necessary",
                    "more information", "design your career", "develop your skills",
                    "discover our culture", "viva la difference", "working with cancer"
                ]):
                    continue
                # Skip very short items that are likely headers or UI elements
                if len(line) < 25 and not any(c in line for c in ['.', ',', ':']):
                    continue
                sections[section["type"]].append(line)
    
    return sections


def extract_basic_info(text: str, json_ld: dict) -> dict:
    """Extract basic job info from text and JSON-LD."""
    info = {
        "title": None,
        "company": None,
        "location": None,
        "employment_type": None,
        "salary": None,
        "work_arrangement": None,
    }
    
    # Try JSON-LD first (wrapped in try-except for safety)
    if json_ld:
        try:
            info["title"] = json_ld.get("title")
            info["employment_type"] = json_ld.get("employmentType")
        except Exception:
            pass
        
        try:
            if "hiringOrganization" in json_ld:
                org = json_ld["hiringOrganization"]
                if isinstance(org, dict):
                    info["company"] = org.get("name")
                elif isinstance(org, str):
                    info["company"] = org
        except Exception:
            pass
        
        try:
            if "jobLocation" in json_ld:
                loc = json_ld["jobLocation"]
                # Handle list of locations
                if isinstance(loc, list) and len(loc) > 0:
                    loc = loc[0]
                if isinstance(loc, dict) and "address" in loc:
                    addr = loc["address"]
                    if isinstance(addr, dict):
                        parts = []
                        for key in ["addressLocality", "addressRegion", "addressCountry"]:
                            val = addr.get(key)
                            if isinstance(val, str):
                                parts.append(val)
                            elif isinstance(val, dict) and "name" in val:
                                parts.append(val["name"])
                        info["location"] = ", ".join(parts) if parts else None
                    elif isinstance(addr, str):
                        info["location"] = addr
        except Exception:
            pass
        
        try:
            if "baseSalary" in json_ld:
                salary = json_ld["baseSalary"]
                if isinstance(salary, dict) and "value" in salary:
                    val = salary["value"]
                    if isinstance(val, dict):
                        min_val = val.get("minValue", 0)
                        max_val = val.get("maxValue", 0)
                        unit = val.get("unitText", "YEAR")
                        if min_val or max_val:
                            info["salary"] = f"${min_val:,} - ${max_val:,} per {unit.lower()}"
        except Exception:
            pass
    
    # Extract from text if not found
    try:
        text_lower = text.lower() if text else ""
        
        # Work arrangement
        if "remote" in text_lower and "hybrid" not in text_lower:
            info["work_arrangement"] = "Remote"
        elif "hybrid" in text_lower:
            hybrid_match = re.search(r'(\d+)\s*days?\s*(?:per\s*week|/\s*week)?\s*(?:in\s*)?(?:office|on-?site)', text, re.IGNORECASE)
            if hybrid_match:
                info["work_arrangement"] = f"Hybrid ({hybrid_match.group(1)} days/week in office)"
            else:
                info["work_arrangement"] = "Hybrid"
        elif "on-site" in text_lower or "onsite" in text_lower or "in-office" in text_lower:
            info["work_arrangement"] = "On-site"
        
        # Salary from text if not in JSON-LD
        if not info["salary"]:
            salary_patterns = [
                r'\$\s*([\d,]+)\s*(?:[-–]\s*\$?\s*([\d,]+))?\s*(?:per\s+|/\s*)?(year|yr|annually|hour|hr|hourly|month|monthly)',
                r'(?:salary|compensation|pay)[:\s]*\$\s*([\d,]+)\s*(?:[-–]\s*\$?\s*([\d,]+))?',
            ]
            for pattern in salary_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    if match.lastindex >= 2 and match.group(2):
                        info["salary"] = f"${match.group(1)} - ${match.group(2)}"
                    else:
                        info["salary"] = f"${match.group(1)}"
                    if match.lastindex >= 3 and match.group(3):
                        info["salary"] += f" per {match.group(3)}"
                    break
    except Exception:
        pass
    
    return info


def scrape_job_posting(url: str) -> dict:
    """Scrape a job posting and extract all useful information."""
    
    # Default empty result
    job_data = {
        "url": url,
        "title": None,
        "company": None,
        "location": None,
        "employment_type": None,
        "salary": None,
        "work_arrangement": None,
        "responsibilities": [],
        "requirements": [],
        "preferred_qualifications": [],
        "benefits": [],
        "about_company": [],
        "skills_mentioned": [],
        "raw_text": "",
    }
    
    try:
        # Fetch page text and any JSON-LD data
        text, json_ld = fetch_page_text(url)
        job_data["raw_text"] = text or ""
        
        # Extract basic info
        try:
            basic_info = extract_basic_info(text, json_ld)
            job_data["title"] = basic_info.get("title")
            job_data["company"] = basic_info.get("company")
            job_data["location"] = basic_info.get("location")
            job_data["employment_type"] = basic_info.get("employment_type")
            job_data["salary"] = basic_info.get("salary")
            job_data["work_arrangement"] = basic_info.get("work_arrangement")
        except Exception as e:
            print(f"Warning: Failed to extract basic info: {e}")
        
        # Parse sections from text
        try:
            sections = parse_job_text(text)
            job_data["responsibilities"] = sections.get("responsibilities", [])
            job_data["requirements"] = sections.get("requirements", [])
            job_data["preferred_qualifications"] = sections.get("preferred", [])
            job_data["benefits"] = sections.get("benefits", [])
            job_data["about_company"] = sections.get("about_company", [])
        except Exception as e:
            print(f"Warning: Failed to parse job sections: {e}")
        
        # Extract skills
        try:
            job_data["skills_mentioned"] = extract_skills(text)
        except Exception as e:
            print(f"Warning: Failed to extract skills: {e}")
            
    except Exception as e:
        print(f"Warning: Failed to fetch page: {e}")
    
    return job_data


def format_job_data(job_data: dict) -> str:
    """Format the extracted job data for display."""
    output = []
    output.append("=" * 60)
    output.append("JOB POSTING ANALYSIS")
    output.append("=" * 60)
    
    output.append(f"\nBASIC INFO")
    output.append(f"   Title: {job_data.get('title') or 'N/A'}")
    output.append(f"   Company: {job_data.get('company') or 'N/A'}")
    output.append(f"   Location: {job_data.get('location') or 'N/A'}")
    output.append(f"   Work Arrangement: {job_data.get('work_arrangement') or 'N/A'}")
    output.append(f"   Employment Type: {job_data.get('employment_type') or 'N/A'}")
    output.append(f"   Salary: {job_data.get('salary') or 'N/A'}")
    
    if job_data.get("responsibilities"):
        output.append(f"\nRESPONSIBILITIES")
        for item in job_data["responsibilities"][:10]:  # Limit to 10
            output.append(f"   • {item}")
    
    if job_data.get("requirements"):
        output.append(f"\nREQUIREMENTS")
        for item in job_data["requirements"][:10]:
            output.append(f"   • {item}")
    
    if job_data.get("preferred_qualifications"):
        output.append(f"\nPREFERRED QUALIFICATIONS")
        for item in job_data["preferred_qualifications"][:5]:
            output.append(f"   • {item}")
    
    if job_data.get("skills_mentioned"):
        output.append(f"\nSKILLS MENTIONED")
        output.append(f"   {', '.join(job_data['skills_mentioned'])}")
    
    if job_data.get("benefits"):
        output.append(f"\nBENEFITS")
        for item in job_data["benefits"][:5]:
            output.append(f"   • {item}")
    
    if job_data.get("about_company"):
        output.append(f"\nABOUT THE COMPANY")
        output.append(f"   {job_data['about_company'][0][:500]}")
    
    output.append("\n" + "=" * 60)
    
    return "\n".join(output)


if __name__ == "__main__":
    url = input("Enter job URL: ")
    print("\nScraping job posting...\n")
    
    job_data = scrape_job_posting(url)
    print(format_job_data(job_data))
    
    print("\nRAW JSON DATA:")
    print(json.dumps(job_data, indent=2))
