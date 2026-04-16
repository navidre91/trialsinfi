from __future__ import annotations

import re

try:
    from .app_config import load_pipeline_config, SiteConfig
except ImportError:
    from app_config import load_pipeline_config, SiteConfig


_NON_HUMAN_RE = re.compile(
    r"director|pfizer|janssen|ctlilly|abbvie|squibb|novartis|roche|merck|"
    r"astrazeneca|bristol.myers|bms\b|sanofi|bayer|global\s+lead|global\s+compliance|"
    r"clinical\s+lead|clinical\s+sites|clinical\s+trials?[,\s]|clinical\s+management|"
    r"medical\s+lead|medical\s+monitor|medical\s+officer|chief\s+officer|"
    r"\bofficer\b|\bmonitor\b|\bcompliance\b|revolution medicines|janux therapeutics|"
    r"iambic therapeutics|indaptus therapeutics|arsenal biosciences|adaptimmune|"
    r"gilead\b|iovance|johnson\s+&?\s*johnson|\btrial[,\s]|\bteam[,\s]|"
    r"pharmaceuticals?[,\s]|therapeutics[,\s]|biosciences?[,\s]|medicines?[,\s]|"
    r"\binc[,.\s]|\bllc\b|\bgmbh\b|study\s+director|site\s+director|call\s+1-|"
    r"1-877|1-317|pharm\.?d\b|pharmd\b|\boncology\s*$|\bhematology\s*$|\boncologist\b",
    re.IGNORECASE,
)
_CREDENTIAL_RE = re.compile(
    r"^(m\.?d\.?|ph\.?d\.?|d\.?o\.?|m\.?p\.?h\.?|m\.?s\.?|r\.?n\.?|n\.?p\.?|"
    r"p\.?a\.?|f\.?a\.?c\.?[spo]\.?|f\.?r\.?c\.?p\.?c?\.?|b\.?c\.?|m\.?b\.?a\.?|"
    r"pharm\.?d\.?|prof\.?|bsn|cnmt|psyd|rph|pharmd)$",
    re.IGNORECASE,
)
_SUFFIX_RE = re.compile(r"^(jr\.?|sr\.?|ii|iii|iv)$", re.IGNORECASE)
_COMMON_GIVEN_NAMES = {
    "james", "john", "robert", "michael", "william", "david", "mark", "paul", "steven",
    "andrew", "matthew", "eric", "christopher", "peter", "daniel", "mary", "jennifer",
    "sarah", "anna", "rana", "neeraj", "amar", "hideki", "felix", "sandip", "atish",
    "sumanta", "siamak", "maha", "arash", "ali", "xiao", "shilpa", "nazli",
}
_NORM_RULES = [
    (r"city of hope.*(irvine|lennar|orange county|huntington beach)|lennar.*city of hope",
     "City of Hope – Orange County"),
    (r"city of hope.*corona", "City of Hope – Corona"),
    (r"city of hope|beckman research.*city of hope|duarte cancer", "City of Hope"),
    (r"ucla|jonsson comprehensive|university of california.{0,6}los an[g]?[e]?les|"
     r"david geffen school of medicine|westwood cancer|administrative address.*ucla",
     "UCLA"),
    (r"los angeles county.{0,5}usc|los angeles general medical|lac\+usc",
     "USC / LAC+USC Medical Center"),
    (r"usc|norris|univeristy of southern california|university of southern california|"
     r"keck medicine of usc|koman family outpatient|institute of urology.*southern california|"
     r"university of south california",
     "USC / Norris"),
    (r"ucsd|uc san diego|university of california.{0,6}san diego|moores cancer center|"
     r"rebecca and john moores",
     "UCSD / Moores"),
    (r"uc irvine|uci |uci health|university of california.{0,6}irvine|"
     r"chao family comprehensive|irvine medical center",
     "UC Irvine / Chao"),
    (r"cedars?.sin[ae]i|cedars?.senai|angeles clinic", "Cedars-Sinai"),
    (r"veterans affairs loma linda|va.*loma linda", "Loma Linda VA"),
    (r"loma linda", "Loma Linda"),
    (r"greater los angeles.*(va|veterans)|(va|veterans).{0,10}greater los angeles",
     "VA Greater Los Angeles"),
    (r"va long beach|long beach va|tibor rubin", "VA Long Beach"),
    (r"hoag", "Hoag"),
    (r"scripps", "Scripps"),
    (r"providence.*st\.? jude|st\.? joseph heritage|virginia k\.? crosson|"
     r"john wayne cancer|saint john.*cancer",
     "Providence / St. Jude"),
    (r"providence", "Providence Medical Foundation"),
    (r"sharp", "Sharp"),
]


def canonical_pi(name: str) -> str:
    if not name or name == "Not listed":
        return ""
    if "," in name:
        last_name, rest = name.split(",", 1)
        first_initial = rest.strip()[0].lower() if rest.strip() else ""
        return f"{last_name.strip().lower()}|{first_initial}"
    words = name.split()
    last_name = words[-1].lower() if words else ""
    first_initial = words[0][0].lower() if len(words) > 1 else (last_name[0] if last_name else "")
    return f"{last_name}|{first_initial}"


class SiteNormalizer:
    def __init__(self, site_config: SiteConfig | None = None) -> None:
        config = load_pipeline_config()
        self.site_config = site_config or config.site_config
        self._compiled_rules = [(re.compile(pattern, re.IGNORECASE), label) for pattern, label in _NORM_RULES]
        self._socal_cities = {city.lower() for city in self.site_config.cities}
        self._facility_keywords = tuple(keyword.lower() for keyword in self.site_config.facility_keywords)
        self.target_institutions = {
            "UCLA",
            "USC / Norris",
            "USC / LAC+USC Medical Center",
            "UCSD / Moores",
            "UC Irvine / Chao",
            "City of Hope",
            "City of Hope – Orange County",
            "City of Hope – Corona",
            "Hoag",
            "Cedars-Sinai",
            "Providence / St. Jude",
            "Providence Medical Foundation",
            "Loma Linda",
            "Loma Linda VA",
            "VA Greater Los Angeles",
            "VA Long Beach",
            "Scripps",
            "Sharp",
        }

    def normalize_facility(self, facility: str) -> str:
        for regex, label in self._compiled_rules:
            if regex.search(facility or ""):
                return label
        return facility or "Unknown"

    def is_socal_site(self, city: str, facility: str) -> bool:
        if (city or "").lower() in self._socal_cities:
            return True
        facility_lower = (facility or "").lower()
        return any(keyword in facility_lower for keyword in self._facility_keywords)

    def _is_non_human(self, name: str) -> bool:
        return not name or bool(_NON_HUMAN_RE.search(name))

    def _apply_alias(self, name: str) -> str:
        alias_map = self.site_config.pi_aliases
        return alias_map.get(name.lower(), name)

    def clean_pi_name(self, raw: str) -> str:
        if not raw or not raw.strip():
            return "Not listed"
        name = raw.strip().rstrip(",;./")
        parts = [part.strip() for part in name.split(",")]
        cleaned = [part for part in parts if part and not _CREDENTIAL_RE.match(part)]
        name = ", ".join(cleaned).strip().rstrip(",;. ")
        name = re.sub(r"\s{2,}", " ", name)
        if not name or self._is_non_human(name):
            return "Not listed"

        comma_parts = [part.strip() for part in name.split(",") if part.strip()]
        if len(comma_parts) >= 2:
            left = comma_parts[0].split()[0].lower() if comma_parts[0] else ""
            right = comma_parts[1].split()[0].lower() if comma_parts[1] else ""
            if left in _COMMON_GIVEN_NAMES and right not in _COMMON_GIVEN_NAMES:
                name = f"{comma_parts[1]}, {comma_parts[0]}"
        else:
            words = name.split()
            if len(words) >= 2:
                if len(words) >= 3 and _SUFFIX_RE.match(words[-1]):
                    name = f"{words[-2]} {words[-1]}, {' '.join(words[:-2])}"
                else:
                    name = f"{words[-1]}, {' '.join(words[:-1])}"

        return self._apply_alias(name or "Not listed")

    def extract_pi(self, study: dict) -> tuple[str, str]:
        protocol = study.get("protocolSection", {})
        officials = protocol.get("contactsLocationsModule", {}).get("overallOfficials", [])
        for official in officials:
            if "principal" in official.get("role", "").lower():
                name = self.clean_pi_name(official.get("name", ""))
                if name != "Not listed":
                    return name, official.get("affiliation", "")
        responsible_party = protocol.get("sponsorCollaboratorsModule", {}).get("responsibleParty", {})
        if responsible_party.get("type") == "PRINCIPAL_INVESTIGATOR":
            name = self.clean_pi_name(responsible_party.get("investigatorFullName", ""))
            if name != "Not listed":
                return name, responsible_party.get("investigatorAffiliation", "")
        return "Not listed", ""

    def extract_site_contact(self, location: dict) -> tuple[str, str, str]:
        pi_name = ""
        pi_email = ""
        pi_phone = ""

        for contact in location.get("contacts", []):
            if contact.get("role", "").upper() == "PRINCIPAL_INVESTIGATOR":
                name = self.clean_pi_name(contact.get("name", ""))
                if name and name != "Not listed":
                    pi_name = name
                    pi_email = contact.get("email", "")
                    pi_phone = contact.get("phone", "")
                    break

        if not pi_name:
            for investigator in location.get("investigators", []):
                if "principal" in investigator.get("role", "").lower():
                    name = self.clean_pi_name(investigator.get("name", ""))
                    if name and name != "Not listed":
                        pi_name = name
                        break

        if not pi_email and not pi_phone:
            for contact in location.get("contacts", []):
                if contact.get("name") and (contact.get("email") or contact.get("phone")):
                    pi_email = pi_email or contact.get("email", "")
                    pi_phone = pi_phone or contact.get("phone", "")
                    break

        return pi_name, pi_email, pi_phone


DEFAULT_NORMALIZER = SiteNormalizer()
