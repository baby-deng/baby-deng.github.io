const STORAGE_KEY = "medical-job-materials-platform-v1";
const CLOUD_SAVE_DELAY = 180;

const SECTION_ORDER = [
  "city",
  "platform",
  "position",
  "requirements",
  "compensation",
  "policy",
  "application",
];

const SECTION_LABELS = {
  city: "城市概况",
  platform: "平台背景",
  position: "岗位定位",
  requirements: "任职要求",
  compensation: "薪酬与发展",
  policy: "人才政策",
  application: "应聘方式",
};

const DEFAULT_SETTINGS = {
  consultantName: "汤梦竹",
  consultantTitle: "丁香园猎头顾问",
  phone: "18257505728",
  wechat: "18257505728",
  applicationFlow:
    "有意向可先与猎头顾问沟通岗位情况。经本人同意后向医院推荐，并协助安排医院沟通、面试及后续录用和入职流程。",
};

const CITY_ENRICHMENTS = {
  "宁波市": {
    cityPosition: "长三角重要港口城市、计划单列市",
    population: "983.3万人（2025年末）",
    gdp: "18716亿元（2025年）",
    gdpRank: "浙江省第2位、全国城市第11位（2025年GDP）",
    perCapitaGdp: "约19.03万元（按2025年GDP与年末常住人口测算）",
    disposableIncome: "77779元（2025年居民人均可支配收入）",
    housingPrice: "16620元/㎡（2026年9月住宅挂牌均价）",
    housingComparison: "同口径下，杭州为34529元/㎡、上海为60398元/㎡。宁波约为杭州的48%、上海的28%，住房成本分别低约52%和72%。",
    medical: "2025年全市拥有三甲医院11家、三乙医院14家，三级医院数量和区域医疗承载能力位居浙江省前列。",
    medicalCompetition: "宁波本地综合性三甲平台较多，成熟学科带头人竞争较强；同时杭州、上海的高能级医院对高层次人才和疑难患者存在吸引力。宁波的优势是患者基数大、区域辐射稳定，且生活和住房成本明显低于杭州、上海。",
    attractiveness: "宁波不是单纯的低成本城市，而是经济总量全国前列、医疗平台密集、生活成本相对可控的强二线城市。对医疗人才而言，适合强调“平台能级与杭州接近、生活压力显著低于杭州上海”的综合性价比。",
  },
};

const ORGANIZATION_ENRICHMENTS = {
  "宁波市医疗中心李惠利医院": {
    locationPosition: "双院区覆盖宁波主城区东西两侧：兴宁院区位于鄞州区兴宁路成熟主城区生活圈；东部院区位于宁波东部新城、高新区发展轴，靠近城市行政商务新区和产业人才集聚区。",
    campusAccess: "兴宁院区到宁波站通常约15—20分钟车程、到宁波栎社国际机场约25—35分钟；东部院区到宁波站约30—40分钟、到机场约35—45分钟。实际时间受时段和路况影响。",
    publicTransit: "兴宁院区公交和主城区道路网络成熟；东部院区可通过轨道交通及江南路、世纪大道等城市主干路到达，日常通勤便利，但距离传统老城中心相对更远。",
    bedRank: "宁波主要综合性三甲医院中核定床位体量约居前二",
    scaleComparison: "按医院公开核定床位口径：宁波大学附属第一医院约4400张、李惠利医院2600张、宁波市第二医院2100张、宁波大学附属人民医院1815张。李惠利医院明显高于多数市级综合三甲，属于宁波第一梯队的大型综合医院。",
    platformAttractiveness: "对候选人而言，2600张核定床位意味着稳定的患者基数、较大的临床业务承载空间和更完整的多学科协作条件；双院区布局则兼顾成熟主城区资源与东部新城发展空间。",
  },
};

const state = {
  data: loadLocalData(),
  sourceJobs: [],
  workingJob: null,
  editorSection: "city",
  search: "",
  cityFilter: "",
  statusFilter: "",
};

let cloudRevision = 0;
let pendingCloudData = null;
let cloudSaveTimer = null;
let cloudSaveInProgress = false;

function loadLocalData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        jobs: enrichCityData(Array.isArray(parsed.jobs) ? parsed.jobs : []),
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      };
    } catch (error) {
      console.warn("Stored data could not be read. Resetting local data.", error);
    }
  }

  return {
    jobs: enrichCityData(seedJobs()),
    settings: { ...DEFAULT_SETTINGS },
  };
}

function enrichCityData(jobs) {
  const cityJobs = jobs.map((job) => {
    const enrichment = CITY_ENRICHMENTS[job.city];
    if (!enrichment) return job;
    if (!job.sections) job.sections = emptySections();
    if (!job.sections.city) job.sections.city = emptySections().city;
    Object.entries(enrichment).forEach(([key, value]) => {
      const current = job.sections.city[key];
      const isStaleSeed = key === "population" && String(current || "").includes("977.7");
      const isStaleGdp = key === "gdp" && String(current || "").includes("1.87万亿");
      if (!current || isStaleSeed || isStaleGdp) job.sections.city[key] = value;
    });
    if (String(job.sections.city.summary || "").includes("经济基础扎实，交通便利")) {
      job.sections.city.summary = "宁波是长三角重要港口城市和先进制造业基地，2025年经济总量位居浙江省第2、全国城市第11，兼具较强平台能级和相对可控的生活成本。";
    }
    return job;
  });
  return enrichOrganizationData(cityJobs);
}

function normalizeCityKey(city) {
  return String(city || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/市$/, "")
    .toLowerCase();
}

function cityProfileScore(job) {
  return Object.values(job?.sections?.city || {}).filter((value) => String(value || "").trim()).length;
}

function cityProfileJobs(city, jobs = state.data.jobs) {
  const key = normalizeCityKey(city);
  if (!key) return [];
  return jobs
    .filter((job) => normalizeCityKey(job.city) === key)
    .sort((left, right) => {
      const scoreDifference = cityProfileScore(right) - cityProfileScore(left);
      if (scoreDifference) return scoreDifference;
      return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
    });
}

function canonicalCityName(city, jobs = state.data.jobs) {
  return cityProfileJobs(city, jobs)[0]?.city || String(city || "").trim();
}

function synchronizeSharedCityProfiles(jobs) {
  const groups = new Map();
  jobs.forEach((job) => {
    const key = normalizeCityKey(job.city);
    if (!key) return;
    const group = groups.get(key) || [];
    group.push(job);
    groups.set(key, group);
  });

  groups.forEach((group) => {
    const ranked = cityProfileJobs(group[0].city, group);
    const sharedCity = emptySections().city;
    ranked.forEach((job) => {
      Object.entries(job.sections?.city || {}).forEach(([field, value]) => {
        if (!String(sharedCity[field] || "").trim() && String(value || "").trim()) {
          sharedCity[field] = clone(value);
        }
      });
    });

    const sharedName = ranked[0]?.city || group[0].city;
    group.forEach((job) => {
      job.city = sharedName;
      if (!job.sections) job.sections = emptySections();
      job.sections.city = clone(sharedCity);
    });
  });
  return jobs;
}

function applyCityProfileToMatchingJobs(jobs, city, cityProfile) {
  const key = normalizeCityKey(city);
  if (!key) return;
  jobs.forEach((job) => {
    if (normalizeCityKey(job.city) !== key) return;
    job.city = city;
    if (!job.sections) job.sections = emptySections();
    job.sections.city = clone(cityProfile || emptySections().city);
  });
}

function enrichOrganizationData(jobs) {
  return jobs.map((job) => {
    const enrichment = ORGANIZATION_ENRICHMENTS[job.organization];
    if (!enrichment) return job;
    if (!job.sections) job.sections = emptySections();
    if (!job.sections.platform) job.sections.platform = emptySections().platform;
    Object.entries(enrichment).forEach(([key, value]) => {
      if (!job.sections.platform[key]) job.sections.platform[key] = value;
    });
    return job;
  });
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  pendingCloudData = clone(state.data);
  setCloudStatus("正在保存", "connecting");
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(flushCloudSave, CLOUD_SAVE_DELAY);
}

async function bootstrapApp() {
  try {
    const session = await materialsCloud.session();
    if (!session) {
      location.replace("./login.html");
      return;
    }
    const cloud = await materialsCloud.loadWorkspace();
    cloudRevision = Number(cloud.revision || 0);

    if (cloud.data?.jobs?.length) {
      state.data = normalizeWorkspace(cloud.data);
      state.sourceJobs = Array.isArray(cloud.data.sourceJobs) ? cloud.data.sourceJobs : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      setCloudStatus("云端已同步");
    } else {
      state.data = normalizeWorkspace(state.data);
      state.sourceJobs = Array.isArray(cloud.data?.sourceJobs) ? cloud.data.sourceJobs : [];
      pendingCloudData = clone(state.data);
      await flushCloudSave();
      showToast("已将本机岗位资料迁移到云端");
    }

    document.getElementById("header-consultant-name").textContent = state.data.settings.consultantName;
    renderRoute();
  } catch (error) {
    state.data = normalizeWorkspace(state.data);
    if (state.data.jobs.length) {
      setCloudStatus("离线浏览", "error");
      document.getElementById("header-consultant-name").textContent = state.data.settings.consultantName;
      renderRoute();
      showToast("云端暂时未连接，已显示本机最近保存的资料");
      return;
    }
    renderStartupError(error.message);
  }
}

function normalizeWorkspace(data) {
  return {
    jobs: synchronizeSharedCityProfiles(enrichCityData(Array.isArray(data?.jobs) ? data.jobs : [])),
    settings: { ...DEFAULT_SETTINGS, ...(data?.settings || {}) },
  };
}

async function flushCloudSave() {
  clearTimeout(cloudSaveTimer);
  if (cloudSaveInProgress || !pendingCloudData) return;
  cloudSaveInProgress = true;
  const snapshot = pendingCloudData;
  pendingCloudData = null;

  try {
    const result = await materialsCloud.saveWorkspace(snapshot, cloudRevision);
    cloudRevision = Number(result.revision);
    setCloudStatus("已保存到云端");
  } catch (error) {
    setCloudStatus("云端保存失败", "error");
    if (error.message.includes("其他设备")) showToast("资料已在其他设备更新，请刷新后再编辑");
    else showToast("云端保存失败，本机仍保留了当前资料");
  } finally {
    cloudSaveInProgress = false;
    if (pendingCloudData) cloudSaveTimer = setTimeout(flushCloudSave, CLOUD_SAVE_DELAY);
  }
}

function setCloudStatus(label, className = "") {
  const element = document.getElementById("cloud-sync-status");
  if (!element) return;
  element.className = `cloud-sync ${className}`.trim();
  const text = element.querySelector("span");
  if (text) text.textContent = label;
}

function renderStartupError(message) {
  setCloudStatus("云端连接失败", "error");
  const main = document.getElementById("app-main");
  main.innerHTML = `<section class="surface empty-state"><strong>暂时无法连接云端资料</strong><p>${escapeHTML(message)}</p><button class="primary-button" type="button" data-action="reload-app">重新连接</button></section>`;
}

async function logout() {
  try {
    await materialsCloud.signOut();
  } finally {
    location.replace("./login.html");
  }
}

function seedJobs() {
  return [
    {
      id: "lihuili-eye-leader",
      city: "宁波市",
      organization: "宁波市医疗中心李惠利医院",
      department: "眼科",
      role: "眼科带头人",
      campus: "东部院区",
      status: "saved",
      updatedAt: "2026-10-27",
      sections: {
        city: {
          cityPosition: "长三角重要港口城市、计划单列市",
          population: "约977.7万人（2025年）",
          gdp: "约1.87万亿元（2025年）",
          economy: "港口经济与先进制造业基础较强，民营经济活跃。",
          education: "拥有宁波大学、宁波诺丁汉大学等高等教育资源。",
          medical: "市内拥有多家三级甲等医院，医疗资源覆盖综合及专科体系。",
          transport: "高铁、机场及高速路网完善，可便捷连接杭州、上海等长三角核心城市。",
          summary:
            "宁波是长三角重要港口城市和先进制造业基地，城市经济基础扎实，交通便利，并拥有宁波大学、宁波诺丁汉大学等教育资源。",
        },
        platform: {
          hospitalNature: "公立综合医院",
          grade: "三级甲等",
          hospitalType: "综合医院",
          affiliation: "宁波大学附属医院",
          history: "历史可追溯至1843年，1993年创建宁波市医疗中心。",
          campuses: "兴宁院区、东部院区",
          address: "宁波市鄞州区江南路1111号",
          transit: "地铁5号线、6号线院士路站可达",
          beds: "2600张",
          staff: "3833人",
          visits: "年门急诊近300万人次，年出院超15万人次，年手术近7万台次",
          performance: "全国公立医院绩效考核连续六年全国百强、A+等级",
          research: "拥有9.85万平方米独栋综合科研大楼和较完整的医学科创体系",
          hospitalSummary:
            "医院是宁波市首批三级甲等综合性公立医院和宁波大学附属医院，目前设兴宁、东部两个院区，核定床位2600张。医院在疑难危重症救治、临床技术、科研平台和智慧医院建设方面具有较强综合基础。",
          departmentName: "眼科",
          departmentLocation: "东部院区医疗楼9楼A区",
          team: "13名医生",
          titleStructure: "主任医师3名、副主任医师4名、主治医师6名",
          departmentBeds: "",
          departmentVolume: "",
          specialties: "眼科临床诊疗及学科建设",
          technology: "",
          discipline: "国家级住院医师规范化培训基地",
          teaching: "承担住院医师规范化培训任务",
          departmentSummary:
            "眼科位于东部院区医疗楼9楼A区，官网公开13名医生，包括主任医师3名、副主任医师4名、主治医师6名，并具备国家级住院医师规范化培训基础。",
        },
        position: {
          headcount: "1人",
          direction: "眼科学相关方向",
          recruitmentBackground:
            "医院拟引进眼科带头人，进一步加强科室学科建设、临床能力和人才梯队。具体招聘背景可根据医院最新沟通情况继续补充。",
          positionSummary:
            "面向具备较强临床能力、科室管理或学科建设经验的成熟眼科人才，具体职责和资源配置以医院正式沟通为准。",
        },
        requirements: {
          direction: "眼科学相关方向",
          education: "硕士研究生及以上",
          degree: "硕士及以上学位",
          title: "主任医师优先",
          age: "面议",
          qualifications: "具备执业医师资格及相应专业技术资格",
          clinicalExperience: "具有较丰富的眼科临床工作经验",
          managementExperience: "具备科室管理经验者优先",
          disciplineExperience: "具有学科建设或团队培养经验者优先",
          clinicalSkills: "具备明确的眼科专业方向和临床技术专长",
          research: "有科研项目或代表性成果者优先",
          teaching: "具备教学或人才培养经验者优先",
          other: "具体任职条件以医院最终沟通结果为准。",
        },
        compensation: {
          salaryEmployment: "薪酬、编制或用工性质由医院结合人选情况面议。",
          developmentSupport: "学科发展、团队配置和科研支持可在进入正式沟通后进一步确认。",
        },
        policy: { text: "符合条件的人选可进一步沟通医院及宁波市相关人才政策。" },
        application: {},
      },
    },
    {
      id: "lihuili-oral-leader",
      city: "宁波市",
      organization: "宁波市医疗中心李惠利医院",
      department: "口腔科",
      role: "口腔科带头人",
      campus: "兴宁、东部双院区",
      status: "draft",
      updatedAt: "2026-10-18",
      sections: createCollectedSections({
        city: "宁波市",
        organization: "宁波市医疗中心李惠利医院",
        department: "口腔科",
        role: "口腔科带头人",
        campus: "兴宁、东部双院区",
      }),
    },
  ];
}

function emptySections() {
  return {
    city: {
      cityPosition: "",
      population: "",
      gdp: "",
      gdpRank: "",
      perCapitaGdp: "",
      disposableIncome: "",
      economy: "",
      education: "",
      medical: "",
      medicalCompetition: "",
      transport: "",
      housingPrice: "",
      housingComparison: "",
      attractiveness: "",
      summary: "",
    },
    platform: {
      hospitalNature: "",
      grade: "",
      hospitalType: "",
      affiliation: "",
      history: "",
      campuses: "",
      address: "",
      transit: "",
      locationPosition: "",
      campusAccess: "",
      publicTransit: "",
      beds: "",
      bedRank: "",
      scaleComparison: "",
      staff: "",
      visits: "",
      performance: "",
      research: "",
      platformAttractiveness: "",
      hospitalSummary: "",
      departmentName: "",
      departmentLocation: "",
      team: "",
      titleStructure: "",
      departmentBeds: "",
      departmentVolume: "",
      specialties: "",
      technology: "",
      discipline: "",
      teaching: "",
      departmentSummary: "",
    },
    position: {
      headcount: "",
      direction: "",
      recruitmentBackground: "",
      positionSummary: "",
    },
    requirements: {
      direction: "",
      education: "",
      degree: "",
      title: "",
      age: "",
      qualifications: "",
      clinicalExperience: "",
      managementExperience: "",
      disciplineExperience: "",
      clinicalSkills: "",
      research: "",
      teaching: "",
      other: "",
    },
    compensation: { salaryEmployment: "", developmentSupport: "" },
    policy: { text: "" },
    application: {},
  };
}

function createCollectedSections(base) {
  const sections = emptySections();
  if (base.city.includes("宁波")) {
    Object.assign(sections.city, {
      ...CITY_ENRICHMENTS["宁波市"],
      economy: "港口经济与先进制造业基础较强，民营经济活跃。",
      education: "拥有宁波大学、宁波诺丁汉大学等高等教育资源。",
      transport: "高铁、机场及高速路网完善，可便捷连接杭州、上海等城市。",
      summary:
        "宁波是长三角重要港口城市和先进制造业基地，2025年经济总量位居浙江省第2、全国城市第11，兼具较强平台能级和相对可控的生活成本。",
    });
  }

  if (base.organization.includes("李惠利")) {
    Object.assign(sections.platform, {
      ...ORGANIZATION_ENRICHMENTS["宁波市医疗中心李惠利医院"],
      hospitalNature: "公立综合医院",
      grade: "三级甲等",
      hospitalType: "综合医院",
      affiliation: "宁波大学附属医院",
      history: "历史可追溯至1843年，1993年创建宁波市医疗中心。",
      campuses: "兴宁院区、东部院区",
      address: base.campus?.includes("兴宁") ? "宁波市鄞州区兴宁路57号" : "宁波市鄞州区江南路1111号",
      transit: base.campus?.includes("兴宁") ? "地铁4号线白鹤站可达" : "地铁5号线、6号线院士路站可达",
      beds: "2600张",
      staff: "3833人",
      visits: "年门急诊近300万人次，年出院超15万人次，年手术近7万台次",
      performance: "全国公立医院绩效考核连续六年全国百强、A+等级",
      research: "拥有9.85万平方米独栋综合科研大楼",
      hospitalSummary:
        "医院是宁波市首批三级甲等综合性公立医院和宁波大学附属医院，目前设兴宁、东部两个院区，核定床位2600张，具有较强的临床、科研和教学平台基础。",
      departmentName: base.department || "",
    });
  }

  if (base.department.includes("眼科")) {
    Object.assign(sections.platform, {
      departmentLocation: "东部院区医疗楼9楼A区",
      team: "13名医生",
      titleStructure: "主任医师3名、副主任医师4名、主治医师6名",
      discipline: "国家级住院医师规范化培训基地",
      teaching: "承担住院医师规范化培训任务",
      departmentSummary:
        "眼科位于东部院区医疗楼9楼A区，官网公开13名医生，包括主任医师3名、副主任医师4名、主治医师6名，并具备国家级住院医师规范化培训基础。",
    });
  }

  if (base.department.includes("口腔")) {
    Object.assign(sections.platform, {
      departmentLocation: "兴宁院区3号楼13楼；东部院区综合医疗楼11楼C区",
      team: "医务人员22人",
      titleStructure: "主任医师2人、副主任医师5人、硕士研究生12名",
      departmentBeds: "25余张",
      departmentVolume: "年门诊近7万人次，年收住病人2000余人，病房手术1500余人次",
      specialties: "口腔颌面外科、正畸、口腔内科、口腔修复与种植等",
      discipline: "浙江省首批住院医师规范化培训基地",
      departmentSummary:
        "口腔科覆盖口腔颌面外科、正畸、口腔内科、口腔修复与种植等方向，现有医务人员22人，年门诊近7万人次，并具备省级住培基础。",
    });
  }

  sections.position.direction = base.department ? `${base.department}相关专业方向` : "";
  sections.requirements.direction = sections.position.direction;
  return sections;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function makeId(base) {
  const departmentHint = base.department ? "dept" : "general";
  return `job-${departmentHint}-${Date.now().toString(36)}`;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function valueAt(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object) ?? "";
}

function setAt(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, object);
  target[last] = value;
}

function hasValues(object) {
  if (!object) return false;
  return Object.values(object).some((value) => {
    if (typeof value === "object" && value !== null) return hasValues(value);
    return String(value || "").trim().length > 0;
  });
}

function sectionState(job, key) {
  if (key === "application") return "固定内容";
  return hasValues(job.sections?.[key]) ? "有内容" : "空";
}

function statusLabel(status) {
  if (status === "archived") return "已归档";
  return status === "draft" ? "待补充" : "已保存";
}

function statusClass(status) {
  if (status === "archived") return "archived";
  return status === "draft" ? "draft" : "";
}

function jobSubtitle(job) {
  return [job.department, job.campus].filter(Boolean).join(" · ") || "尚未补充科室和院区";
}

function showToast(message) {
  const region = document.getElementById("toast-region");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function navigate(path) {
  if (location.hash === `#${path}`) {
    renderRoute();
  } else {
    location.hash = path;
  }
}

function parseRoute() {
  const route = location.hash.replace(/^#/, "") || "jobs";
  const [name, encodedId] = route.split("/");
  let id = encodedId;
  try {
    id = encodedId ? decodeURIComponent(encodedId) : encodedId;
  } catch {
    id = encodedId;
  }
  return { name, id };
}

function setActiveNav(routeName) {
  const routeGroups = {
    job: "jobs",
    edit: "jobs",
    new: "jobs",
    city: "cities",
    organization: "organizations",
    department: "organizations",
  };
  const activeRoute = routeGroups[routeName] || routeName;
  document.querySelectorAll(".nav-entry").forEach((entry) => {
    entry.classList.toggle("active", entry.dataset.route === activeRoute);
  });
}

function renderRoute() {
  const { name, id } = parseRoute();
  setActiveNav(name);
  document.getElementById("app-sidebar").classList.remove("open");
  document.getElementById("header-consultant-name").textContent = state.data.settings.consultantName;

  if (name === "new") return renderNewJob(id);
  if (name === "edit") return prepareEditor(id);
  if (name === "job") return renderJobDetail(id);
  if (name === "cities") return renderCities();
  if (name === "city") return renderCityDetail(id);
  if (name === "organizations") return renderOrganizations();
  if (name === "organization") return renderOrganizationDetail(id);
  if (name === "department") return renderDepartmentDetail(id);
  if (name === "settings") return renderSettings();
  return renderJobs();
}

function page(content) {
  const main = document.getElementById("app-main");
  main.innerHTML = `<div class="page-enter">${content}</div>`;
  main.focus({ preventScroll: true });
}

function renderJobs() {
  const cities = [...new Set([...state.data.jobs, ...state.sourceJobs].map((job) => job.city).filter(Boolean))].sort();
  const query = state.search.trim().toLowerCase();
  const jobs = state.data.jobs.filter((job) => {
    const haystack = `${job.city} ${job.organization} ${job.department} ${job.role}`.toLowerCase();
    return (
      (!query || haystack.includes(query)) &&
      (!state.cityFilter || job.city === state.cityFilter) &&
      (state.statusFilter === "source" ? false : state.statusFilter ? job.status === state.statusFilter : job.status !== "archived")
    );
  });
  const sourceJobs = state.sourceJobs.filter((job) => {
    const haystack = `${job.city} ${job.organization} ${job.department} ${job.role}`.toLowerCase();
    return (
      (!query || haystack.includes(query)) &&
      (!state.cityFilter || job.city === state.cityFilter) &&
      (!state.statusFilter || state.statusFilter === "source")
    );
  });

  page(`
    <div class="page-heading">
      <div>
        <p class="eyebrow">Job Materials</p>
        <h1>岗位资料库</h1>
        <p>一个资料库保存所有岗位，每条资料都可以单独查看和继续编辑。</p>
      </div>
      <button class="primary-button" type="button" data-action="new-job">＋ 新建岗位资料</button>
    </div>

    <div class="library-toolbar">
      <input class="search-input" id="job-search" value="${escapeHTML(state.search)}" placeholder="搜索医院、科室或岗位">
      <select class="field-select" id="city-filter" aria-label="按城市筛选">
        <option value="">全部城市</option>
        ${cities.map((city) => `<option value="${escapeHTML(city)}" ${state.cityFilter === city ? "selected" : ""}>${escapeHTML(city)}</option>`).join("")}
      </select>
      <select class="field-select" id="status-filter" aria-label="按状态筛选">
        <option value="">在招岗位</option>
        <option value="saved" ${state.statusFilter === "saved" ? "selected" : ""}>已保存</option>
        <option value="draft" ${state.statusFilter === "draft" ? "selected" : ""}>待补充</option>
        <option value="source" ${state.statusFilter === "source" ? "selected" : ""}>岗位运营待建立</option>
        <option value="archived" ${state.statusFilter === "archived" ? "selected" : ""}>已归档</option>
      </select>
    </div>

    ${sourceJobs.length ? `
      <section class="surface source-job-list">
        <div class="source-job-heading">
          <div><span>来自猎头岗位运营</span><strong>${sourceJobs.length} 个岗位待建立完整资料</strong></div>
          <p>基础信息已经存在，无需重复新建。点击后会带入原始需求并进入 AI 补充流程。</p>
        </div>
        <div class="job-list-head"><span>岗位</span><span>城市</span><span>运营状态</span><span>现有信息</span><span>操作</span></div>
        ${sourceJobs.map(renderSourceJobRow).join("")}
      </section>` : ""}

    ${state.statusFilter === "source" ? "" : `<section class="surface job-list">
      <div class="job-list-head"><span>岗位资料</span><span>城市</span><span>最近更新</span><span>状态</span><span>操作</span></div>
      ${jobs.length ? jobs.map(renderJobRow).join("") : `
        <div class="empty-state">
          <strong>没有找到岗位资料</strong>
          <p>可以调整搜索条件，或者建立一条新的岗位资料。</p>
          <button class="primary-button" type="button" data-action="new-job">新建岗位资料</button>
        </div>`}
    </section>`}
  `);
}

function renderSourceJobRow(job) {
  const informationCount = [job.sourceBrief, job.compensationPolicy, ...(job.requirements || []).map((item) => item.value)].filter(Boolean).length;
  return `
    <div class="job-list-row source-job-row">
      <div class="job-title-button">
        <strong>${escapeHTML(job.organization)}｜${escapeHTML(job.role)}</strong>
        <small>${escapeHTML(job.department || "科室待补充")}</small>
      </div>
      <span>${escapeHTML(job.city || "待补充")}</span>
      <span class="status-pill">${escapeHTML(job.operationsStatus || "在库")}</span>
      <span>${informationCount ? `已有 ${informationCount} 项基础信息` : "仅有岗位名称"}</span>
      <div class="row-actions">
        <button class="primary-button compact-button" type="button" data-action="import-source-job" data-id="${escapeHTML(job.id)}">AI建立资料</button>
      </div>
    </div>`;
}

function renderJobRow(job) {
  return `
    <div class="job-list-row">
      <button class="job-title-button" type="button" data-action="view-job" data-id="${escapeHTML(job.id)}">
        <strong>${escapeHTML(job.organization)}｜${escapeHTML(job.role)}</strong>
        <small>${escapeHTML(jobSubtitle(job))}</small>
      </button>
      <span>${escapeHTML(job.city)}</span>
      <span>${escapeHTML(job.updatedAt)}</span>
      <span class="status-pill ${statusClass(job.status)}">${statusLabel(job.status)}</span>
      <div class="row-actions">
        <button class="text-action" type="button" data-action="view-job" data-id="${escapeHTML(job.id)}">查看</button>
        <button class="text-action" type="button" data-action="edit-job" data-id="${escapeHTML(job.id)}">编辑</button>
      </div>
    </div>`;
}

function renderNewJob(prefillOrganization = "") {
  state.workingJob = null;
  const sourceJobs = state.data.jobs.filter((job) => job.organization === prefillOrganization);
  const sourceJob = newestFirst(sourceJobs)[0];
  const prefillCity = sourceJob?.city || "";
  page(`
    <div class="page-heading">
      <div>
        <p class="eyebrow">Create</p>
        <h1>${sourceJob ? "新增该院岗位" : "新建岗位资料"}</h1>
        <p>${sourceJob ? `城市和医院资料将从${escapeHTML(prefillOrganization)}自动复用，只需填写新的科室和岗位。` : "城市、单位和招聘岗位是唯一需要先填写的内容。"}</p>
      </div>
      ${sourceJob ? `<button class="quiet-button" type="button" data-action="view-organization" data-id="${escapeHTML(prefillOrganization)}">返回医院资料</button>` : `<button class="quiet-button" type="button" data-action="go-jobs">返回资料库</button>`}
    </div>

    <div class="creation-grid">
      <section class="surface">
        <div class="surface-header"><strong>基础信息</strong><span>${sourceJob ? "已关联现有医院资料" : "三个字段即可开始"}</span></div>
        <form class="form-body" id="new-job-form">
          ${sourceJob ? `<div class="reuse-notice"><strong>已自动复用</strong><span>${escapeHTML(prefillCity)}的城市资料、${escapeHTML(prefillOrganization)}的医院资料</span></div>` : ""}
          <div class="form-grid">
            ${inputField("city", "城市", "例如：宁波市", prefillCity, true)}
            ${inputField("organization", "单位名称", "例如：宁波市医疗中心李惠利医院", prefillOrganization, true)}
            ${inputField("department", "招聘科室", "例如：眼科，可稍后补充")}
            ${inputField("role", "招聘岗位", "例如：眼科带头人", "", true)}
            ${inputField("campus", "工作院区", "例如：东部院区", "", false, "full")}
          </div>
          <div class="ai-panel">
            <strong>让AI先收集一轮公开资料</strong>
            <p>${sourceJob ? "系统保留已有城市和医院资料，只重新收集新科室与新岗位的信息。" : "系统会根据城市、单位、科室和岗位整理七个维度。找不到的信息保持为空，不自动猜测。"}</p>
            <div class="button-row">
              <button class="primary-button" type="submit">开始AI收集</button>
              <button class="secondary-button" type="button" data-action="blank-draft">暂不收集，直接填写</button>
            </div>
            <div class="collection-progress" id="collection-progress">
              <div class="progress-track"><div class="progress-bar" id="progress-bar"></div></div>
              <div class="progress-copy"><span id="progress-label">正在准备检索…</span><span id="progress-percent">0%</span></div>
            </div>
          </div>
        </form>
      </section>

      <section class="surface">
        <div class="surface-header"><strong>资料形成过程</strong><span>确认后才进入资料库</span></div>
        <div class="step-list">
          ${stepItem("01", "检索公开信息", "城市、医院、科室及公开招聘内容", "AI")}
          ${stepItem("02", "整理七个维度", "自动归类数据字段和介绍文字", "AI")}
          ${stepItem("03", "人工检查补充", "修改错误内容，补充客户沟通信息", "你")}
          ${stepItem("04", "保存岗位资料", "保存后形成一条可反复使用的岗位资料", "你")}
        </div>
      </section>
    </div>
  `);
}

function inputField(name, label, placeholder, value = "", required = false, extraClass = "") {
  return `
    <div class="field-group ${extraClass}">
      <label for="${name}">${label}${required ? " *" : ""}</label>
      <input class="field-input" id="${name}" name="${name}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}" ${required ? "required" : ""}>
    </div>`;
}

function stepItem(number, title, body, owner) {
  return `<div class="step-item"><span class="step-number">${number}</span><div><strong>${title}</strong><small>${body}</small></div><span class="step-state">${owner}</span></div>`;
}

function readNewJobForm() {
  const form = document.getElementById("new-job-form");
  if (!form.reportValidity()) return null;
  const data = new FormData(form);
  const city = String(data.get("city") || "").trim();
  return {
    city: canonicalCityName(city),
    organization: String(data.get("organization") || "").trim(),
    department: String(data.get("department") || "").trim(),
    role: String(data.get("role") || "").trim(),
    campus: String(data.get("campus") || "").trim(),
  };
}

function buildNewJobSections(base, collectPublicData) {
  const sections = collectPublicData ? createCollectedSections(base) : emptySections();
  const citySourceJob = cityProfileJobs(base.city)[0];
  if (citySourceJob?.sections?.city) sections.city = clone(citySourceJob.sections.city);

  const sourceJob = newestFirst(state.data.jobs.filter((job) => job.organization === base.organization))[0];
  if (!sourceJob) return sections;

  sections.city = clone(sourceJob.sections.city || citySourceJob?.sections?.city || sections.city);
  const sharedHospitalFields = [
    "hospitalNature", "grade", "hospitalType", "affiliation", "history", "campuses",
    "locationPosition", "campusAccess", "publicTransit", "beds", "bedRank", "scaleComparison",
    "staff", "visits", "performance", "research", "platformAttractiveness", "hospitalSummary",
  ];
  sharedHospitalFields.forEach((field) => {
    const value = sourceJob.sections.platform?.[field];
    if (value) sections.platform[field] = clone(value);
  });
  sections.platform.departmentName = base.department;
  return sections;
}

function buildImportedJob(sourceJob) {
  const base = {
    city: canonicalCityName(sourceJob.city || ""),
    organization: sourceJob.organization || "",
    department: sourceJob.department || "",
    role: sourceJob.role || "",
    campus: "",
  };
  const job = {
    ...base,
    id: sourceJob.id,
    status: "draft",
    operationsStatus: sourceJob.operationsStatus || "",
    updatedAt: today(),
    sourceBrief: sourceJob.sourceBrief || "",
    sections: buildNewJobSections(base, true),
  };

  const dimensionPaths = {
    "专业方向": "sections.requirements.direction",
    "学历": "sections.requirements.education",
    "学位": "sections.requirements.degree",
    "职称": "sections.requirements.title",
    "年龄": "sections.requirements.age",
    "执业及专业资质": "sections.requirements.qualifications",
    "临床经验": "sections.requirements.clinicalExperience",
    "管理经验": "sections.requirements.managementExperience",
    "学科建设经验": "sections.requirements.disciplineExperience",
    "临床技术": "sections.requirements.clinicalSkills",
    "科研": "sections.requirements.research",
    "教学": "sections.requirements.teaching",
    "其他条件": "sections.requirements.other",
  };
  (sourceJob.requirements || []).forEach((requirement) => {
    const path = dimensionPaths[requirement.dimension];
    if (path && requirement.value) setAt(job, path, requirement.value);
  });

  if (sourceJob.sourceBrief) {
    const intake = parseSmartIntake(sourceJob.sourceBrief);
    Object.entries(intake.fields).forEach(([path, value]) => {
      if (!valueAt(job, path)) setAt(job, path, value);
    });
    job.sections.position.recruitmentBackground ||= sourceJob.sourceBrief;
  }
  if (sourceJob.compensationPolicy) {
    job.sections.compensation.salaryEmployment ||= sourceJob.compensationPolicy;
  }
  return job;
}

function startCollection(base) {
  const progress = document.getElementById("collection-progress");
  const bar = document.getElementById("progress-bar");
  const label = document.getElementById("progress-label");
  const percent = document.getElementById("progress-percent");
  progress.classList.add("active");
  const stages = [
    [24, "正在识别城市资料…"],
    [51, "正在整理医院和科室信息…"],
    [78, "正在匹配七个资料维度…"],
    [100, "AI草稿已生成"],
  ];
  let index = 0;
  const run = () => {
    const [value, text] = stages[index];
    bar.style.width = `${value}%`;
    label.textContent = text;
    percent.textContent = `${value}%`;
    index += 1;
    if (index < stages.length) return setTimeout(run, 430);
    setTimeout(() => {
      state.workingJob = {
        ...base,
        id: makeId(base),
        status: "draft",
        updatedAt: today(),
        sections: buildNewJobSections(base, true),
      };
      state.editorSection = "city";
      navigate("edit/new");
    }, 380);
  };
  requestAnimationFrame(run);
}

function prepareEditor(id) {
  if (id === "new") {
    if (!state.workingJob) return navigate("new");
  } else if (!state.workingJob || state.workingJob.id !== id) {
    const existing = state.data.jobs.find((job) => job.id === id);
    if (!existing) return navigate("jobs");
    state.workingJob = clone(existing);
    state.editorSection = "city";
  }
  renderEditor();
}

function renderEditor() {
  const job = state.workingJob;
  if (!job) return navigate("jobs");
  const section = state.editorSection;

  page(`
    <div class="page-heading">
      <div>
        <p class="eyebrow">Review & Edit</p>
        <h1>检查与编辑</h1>
        <p>${escapeHTML(job.organization)}｜${escapeHTML(job.role)} · 有什么保存什么，空内容不会展示。</p>
      </div>
      <div class="button-row">
        <button class="quiet-button" type="button" data-action="cancel-edit">取消</button>
        <button class="secondary-button" type="button" data-action="open-smart-intake">粘贴客户需求</button>
        <button class="primary-button" type="button" data-action="save-job">保存岗位资料</button>
      </div>
    </div>

    <div class="editor-layout">
      <aside class="surface section-nav">
        ${SECTION_ORDER.map((key, index) => `
          <button class="section-nav-button ${section === key ? "active" : ""}" type="button" data-action="editor-section" data-section="${key}">
            <span>${String(index + 1).padStart(2, "0")}　${SECTION_LABELS[key]}</span>
            <span class="section-indicator ${sectionState(job, key) === "空" ? "empty" : ""}">${sectionState(job, key)}</span>
          </button>`).join("")}
      </aside>

      <section class="surface editor-content">
        <div class="surface-header"><strong>${SECTION_LABELS[section]}</strong><span>${editorHint(section)}</span></div>
        <div class="editor-body">
          ${renderEditorSection(job, section)}
          <div class="editor-actions">
            <button class="quiet-button" type="button" data-action="previous-section" ${SECTION_ORDER.indexOf(section) === 0 ? "disabled" : ""}>上一项</button>
            <div class="button-row">
              ${section !== "application" ? `<button class="secondary-button" type="button" data-action="clear-section">清空本项</button>` : ""}
              <button class="primary-button" type="button" data-action="next-section">${SECTION_ORDER.indexOf(section) === SECTION_ORDER.length - 1 ? "保存岗位资料" : "保存并下一项"}</button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <dialog class="smart-intake-dialog" id="smart-intake-dialog">
      <div class="dialog-header">
        <div><p class="eyebrow">Smart Intake</p><h2>整段粘贴客户需求</h2></div>
        <button class="dialog-close" type="button" data-action="close-smart-intake" aria-label="关闭">×</button>
      </div>
      <div class="dialog-body">
        <p class="dialog-intro">把微信、邮件或客户发来的整段岗位要求直接粘贴进来。系统会按常用招聘口径整理字段，并保留“接受在职”等补充条件和完整原文。</p>
        <textarea class="intake-textarea" id="smart-intake-text" placeholder="例如：招聘乳腺外科带头人1名，硕士研究生及以上学历，主任医师，50岁以下，需具备三甲医院临床及科室管理经验。年薪80—100万元，可提供事业编制，安家费100万元……">${escapeHTML(job.sourceBrief || "")}</textarea>
        <div class="intake-scope">
          <span>可识别内容</span>
          <div>招聘人数　专业方向　学历学位　职称年龄　执业资质　临床管理经验　科研教学　薪酬编制　人才政策</div>
        </div>
      </div>
      <div class="dialog-actions">
        <span>识别后请在对应栏目中检查确认</span>
        <div class="button-row">
          <button class="quiet-button" type="button" data-action="close-smart-intake">取消</button>
          <button class="primary-button" type="button" data-action="apply-smart-intake">智能识别并填入</button>
        </div>
      </div>
    </dialog>
  `);
}

function editorHint(section) {
  if (section === "application") return "从个人设置自动带入";
  if (["position", "compensation", "policy"].includes(section)) return "以自由文字补充为主";
  return "AI已整理，可直接修改";
}

function editorField(job, path, label, placeholder = "", options = {}) {
  const value = valueAt(job, path);
  const className = options.span ? "field-group span-2" : "field-group";
  if (options.textarea) {
    return `<div class="${className}"><label>${label}</label><textarea class="field-textarea" data-field="${path}" placeholder="${escapeHTML(placeholder)}">${escapeHTML(value)}</textarea></div>`;
  }
  return `<div class="${className}"><label>${label}</label><input class="field-input" data-field="${path}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}"></div>`;
}

function renderEditorSection(job, section) {
  if (section === "city") {
    return `<div class="editor-intro"><h2>城市概况</h2><p>城市数据适合结构化展示，综合介绍可以由AI生成后再修改。</p></div><div class="editor-fields">
      ${editorField(job, "sections.city.cityPosition", "城市定位")}
      ${editorField(job, "sections.city.population", "常住人口及年份")}
      ${editorField(job, "sections.city.gdp", "GDP及年份")}
      ${editorField(job, "sections.city.gdpRank", "省内及全国经济排名")}
      ${editorField(job, "sections.city.perCapitaGdp", "人均GDP")}
      ${editorField(job, "sections.city.disposableIncome", "居民人均可支配收入")}
      ${editorField(job, "sections.city.economy", "经济和产业特点")}
      ${editorField(job, "sections.city.education", "高校及教育情况", "", { textarea: true })}
      ${editorField(job, "sections.city.medical", "城市医疗资源", "", { textarea: true })}
      ${editorField(job, "sections.city.medicalCompetition", "医疗竞争情况", "本地主要医疗平台、周边城市对人才和患者的吸引情况", { textarea: true, span: true })}
      ${editorField(job, "sections.city.transport", "区位与交通", "", { textarea: true, span: true })}
      ${editorField(job, "sections.city.housingPrice", "城市住房价格")}
      ${editorField(job, "sections.city.housingComparison", "与周边城市房价对比", "统一注明月份和挂牌/成交口径", { textarea: true })}
      ${editorField(job, "sections.city.attractiveness", "猎头解读：城市吸引力", "把数据转成便于向候选人讲解的结论", { textarea: true, span: true })}
      ${editorField(job, "sections.city.summary", "城市综合介绍", "", { textarea: true, span: true })}
    </div>`;
  }

  if (section === "platform") {
    return `<div class="editor-intro"><h2>医院与科室</h2><p>医院和科室资料可以被同一单位的其他岗位继续复用。</p></div><div class="editor-fields">
      ${editorField(job, "sections.platform.hospitalNature", "医院性质")}
      ${editorField(job, "sections.platform.grade", "医院等级")}
      ${editorField(job, "sections.platform.hospitalType", "医院类型")}
      ${editorField(job, "sections.platform.affiliation", "大学附属或教学属性")}
      ${editorField(job, "sections.platform.history", "历史背景", "", { textarea: true, span: true })}
      ${editorField(job, "sections.platform.campuses", "院区情况")}
      ${editorField(job, "sections.platform.address", "工作地址")}
      ${editorField(job, "sections.platform.transit", "周边交通", "", { textarea: true, span: true })}
      ${editorField(job, "sections.platform.locationPosition", "城市区位判断", "是在市中心、主城区、城市新区还是郊县", { textarea: true, span: true })}
      ${editorField(job, "sections.platform.campusAccess", "高铁站与机场通达时间", "分院区说明大致车程", { textarea: true, span: true })}
      ${editorField(job, "sections.platform.publicTransit", "公共交通与日常通勤", "地铁、公交和城市主干路情况", { textarea: true, span: true })}
      ${editorField(job, "sections.platform.beds", "床位")}
      ${editorField(job, "sections.platform.bedRank", "床位体量定位")}
      ${editorField(job, "sections.platform.scaleComparison", "与同城医院规模对比", "保持核定、开放或规划床位口径一致", { textarea: true, span: true })}
      ${editorField(job, "sections.platform.staff", "职工人数")}
      ${editorField(job, "sections.platform.visits", "业务量", "", { textarea: true })}
      ${editorField(job, "sections.platform.performance", "绩效考核或学科地位", "", { textarea: true })}
      ${editorField(job, "sections.platform.research", "科研与教学平台", "", { textarea: true, span: true })}
      ${editorField(job, "sections.platform.platformAttractiveness", "猎头解读：平台吸引力", "把体量和区位转化为候选人能理解的优势", { textarea: true, span: true })}
      ${editorField(job, "sections.platform.hospitalSummary", "医院综合介绍", "", { textarea: true, span: true })}
      ${editorField(job, "sections.platform.departmentName", "科室名称")}
      ${editorField(job, "sections.platform.departmentLocation", "科室位置")}
      ${editorField(job, "sections.platform.team", "团队规模")}
      ${editorField(job, "sections.platform.titleStructure", "职称结构")}
      ${editorField(job, "sections.platform.departmentBeds", "科室床位")}
      ${editorField(job, "sections.platform.departmentVolume", "科室业务量")}
      ${editorField(job, "sections.platform.specialties", "亚专科和业务方向", "", { textarea: true })}
      ${editorField(job, "sections.platform.technology", "特色技术", "", { textarea: true })}
      ${editorField(job, "sections.platform.discipline", "学科或专科情况", "", { textarea: true })}
      ${editorField(job, "sections.platform.teaching", "教学和科研基础", "", { textarea: true })}
      ${editorField(job, "sections.platform.departmentSummary", "科室综合介绍", "", { textarea: true, span: true })}
    </div>`;
  }

  if (section === "position") {
    return `<div class="editor-intro"><h2>岗位定位</h2><p>不拆分过细，直接补充招聘原因、岗位定位和希望引进的人选。</p></div><div class="editor-fields">
      ${editorField(job, "sections.position.headcount", "招聘人数")}
      ${editorField(job, "sections.position.direction", "主要专业方向")}
      ${editorField(job, "sections.position.recruitmentBackground", "招聘背景及原因", "例如：现有科室处于什么阶段，为什么需要引进人才", { textarea: true, span: true })}
      ${editorField(job, "sections.position.positionSummary", "岗位定位及希望引进的人选", "直接写明实际角色和目标人选", { textarea: true, span: true })}
    </div>`;
  }

  if (section === "requirements") {
    return `<div class="editor-intro"><h2>任职要求</h2><p>只填写已有要求，没有明确口径的字段可以留空。</p></div><div class="editor-fields">
      ${editorField(job, "sections.requirements.direction", "专业方向")}
      ${editorField(job, "sections.requirements.education", "学历要求")}
      ${editorField(job, "sections.requirements.degree", "学位要求")}
      ${editorField(job, "sections.requirements.title", "职称要求")}
      ${editorField(job, "sections.requirements.age", "年龄范围")}
      ${editorField(job, "sections.requirements.qualifications", "执业及专业资质")}
      ${editorField(job, "sections.requirements.clinicalExperience", "临床工作经验", "", { textarea: true })}
      ${editorField(job, "sections.requirements.managementExperience", "科室管理经验", "", { textarea: true })}
      ${editorField(job, "sections.requirements.disciplineExperience", "学科建设经验", "", { textarea: true })}
      ${editorField(job, "sections.requirements.clinicalSkills", "临床技术要求", "", { textarea: true })}
      ${editorField(job, "sections.requirements.research", "科研要求", "", { textarea: true })}
      ${editorField(job, "sections.requirements.teaching", "教学要求", "", { textarea: true })}
      ${editorField(job, "sections.requirements.other", "其他条件", "", { textarea: true, span: true })}
    </div>`;
  }

  if (section === "compensation") {
    return `<div class="editor-intro"><h2>薪酬与发展</h2><p>只保留两个大文本框，查到什么写什么，也可以直接粘贴客户口径。</p></div><div class="editor-fields">
      ${editorField(job, "sections.compensation.salaryEmployment", "薪酬及聘用说明", "年薪、绩效、编制、合同性质、岗位聘任等", { textarea: true, span: true })}
      ${editorField(job, "sections.compensation.developmentSupport", "发展及资源支持", "晋升空间、团队支持、科研平台和经费等", { textarea: true, span: true })}
    </div>`;
  }

  if (section === "policy") {
    return `<div class="editor-intro"><h2>人才政策</h2><p>医院只提供安家费或人才补贴时，直接写入即可，不要求拆分所有政策字段。</p></div><div class="editor-fields">
      ${editorField(job, "sections.policy.text", "人才政策说明", "安家费、人才补贴、住房、落户、子女入学或配偶安置等已知信息", { textarea: true, span: true })}
    </div>`;
  }

  const settings = state.data.settings;
  return `<div class="editor-intro"><h2>应聘方式</h2><p>这一部分由个人设置统一维护，所有岗位自动使用。</p></div>
    <div class="fact-grid">
      ${factItem("顾问", `${settings.consultantTitle} ${settings.consultantName}`)}
      ${factItem("联系电话", settings.phone)}
      ${factItem("微信", settings.wechat)}
    </div>
    <div class="text-editor-block"><label>统一应聘流程</label><div class="fake-textarea">${escapeHTML(settings.applicationFlow)}</div></div>
    <button class="secondary-button" type="button" data-action="go-settings">前往个人设置修改</button>`;
}

function saveWorkingJob() {
  const job = clone(state.workingJob);
  job.city = canonicalCityName(job.city);
  job.updatedAt = today();
  if (job.status !== "archived") job.status = "saved";
  const index = state.data.jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) state.data.jobs[index] = job;
  else state.data.jobs.unshift(job);
  applyCityProfileToMatchingJobs(state.data.jobs, job.city, job.sections.city);
  state.sourceJobs = state.sourceJobs.filter((sourceJob) => sourceJob.id !== job.id);
  saveData();
  state.workingJob = null;
  showToast("岗位资料已保存到资料库");
  navigate(`job/${job.id}`);
}

function renderJobDetail(id) {
  const job = state.data.jobs.find((item) => item.id === id);
  if (!job) return navigate("jobs");
  const visibleSections = SECTION_ORDER.filter((key) => key === "application" || hasValues(job.sections?.[key]));
  const metrics = [
    [job.sections.platform.grade, "医院等级"],
    [job.sections.platform.beds, "医院床位"],
    [job.sections.platform.staff, "医院职工"],
    [job.sections.platform.team, "科室团队"],
  ].filter(([value]) => value);

  page(`
    <div class="detail-toolbar">
      <div class="detail-meta">
        <button class="quiet-button" type="button" data-action="go-jobs">← 返回资料库</button>
        <span>最近更新：${escapeHTML(job.updatedAt)}</span>
      </div>
      <div class="button-row">
        ${job.status === "archived" ? `<button class="secondary-button" type="button" data-action="restore-job" data-id="${escapeHTML(job.id)}">恢复招聘</button>` : `<button class="danger-button" type="button" data-action="archive-job" data-id="${escapeHTML(job.id)}">停止招聘并归档</button>`}
        <button class="quiet-button" type="button" data-action="ai-update" data-id="${escapeHTML(job.id)}">AI更新</button>
        <button class="quiet-button" type="button" data-action="edit-job" data-id="${escapeHTML(job.id)}">编辑资料</button>
        <button class="secondary-button" type="button" data-action="copy-job" data-id="${escapeHTML(job.id)}">复制介绍</button>
        <button class="primary-button" type="button" data-action="export-word" data-id="${escapeHTML(job.id)}">导出Word</button>
      </div>
    </div>

    ${job.status === "archived" ? `<div class="archive-notice"><strong>该岗位已停止招聘</strong><span>资料仍然保留，可随时恢复招聘或作为以后同类岗位的参考。</span></div>` : ""}

    <div class="detail-layout">
      <nav class="surface detail-index" aria-label="岗位资料目录">
        ${visibleSections.map((key, index) => `<a href="#section-${key}" data-anchor="section-${key}">${String(index + 1).padStart(2, "0")}　${SECTION_LABELS[key]}</a>`).join("")}
      </nav>

      <article class="surface job-document">
        <header class="document-hero">
          <div class="document-kicker">${escapeHTML(job.city)} · 医疗临床岗位资料</div>
          <h1>${escapeHTML(job.organization)}</h1>
          <div class="document-role">${escapeHTML([job.department, job.role, job.campus].filter(Boolean).join("｜"))}</div>
          ${metrics.length ? `<div class="metric-grid">${metrics.map(([value, label]) => `<div class="metric-tile"><strong>${escapeHTML(value)}</strong><span>${label}</span></div>`).join("")}</div>` : ""}
        </header>
        <div class="document-content">
          ${renderDetailSections(job, visibleSections)}
        </div>
      </article>
    </div>
  `);
}

function sectionTitle(number, title) {
  return `<div class="section-heading-row"><span class="section-number">${String(number).padStart(2, "0")}</span><h2>${title}</h2></div>`;
}

function factItem(label, value) {
  if (!value) return "";
  return `<div class="fact-item"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
}

function renderDetailSections(job, visibleSections) {
  return visibleSections.map((key, index) => {
    const section = job.sections[key] || {};
    if (key === "city") {
      const facts = [
        ["城市定位", section.cityPosition], ["常住人口", section.population], ["GDP", section.gdp],
        ["经济排名", section.gdpRank], ["人均GDP", section.perCapitaGdp], ["人均可支配收入", section.disposableIncome],
        ["经济特点", section.economy], ["教育资源", section.education], ["交通", section.transport],
        ["住房价格", section.housingPrice],
      ];
      const text = [section.summary, section.medicalCompetition, section.housingComparison, section.attractiveness].filter(Boolean).join("\n\n");
      return `<section class="document-section" id="section-city">${sectionTitle(index + 1, SECTION_LABELS[key])}<div class="fact-grid">${facts.map(([label, value]) => factItem(label, value)).join("")}</div>${text ? `<p>${escapeHTML(text)}</p>` : ""}</section>`;
    }
    if (key === "platform") {
      const facts = [
        ["医院性质", section.hospitalNature], ["医院等级", section.grade], ["大学属性", section.affiliation],
        ["院区", section.campuses], ["工作地址", section.address], ["周边交通", section.transit],
        ["城市区位", section.locationPosition], ["高铁/机场通达", section.campusAccess],
        ["床位体量定位", section.bedRank],
        ["科室位置", section.departmentLocation], ["团队规模", section.team], ["职称结构", section.titleStructure],
      ];
      const text = [section.hospitalSummary, section.scaleComparison, section.platformAttractiveness, section.departmentSummary].filter(Boolean).join("\n\n");
      return `<section class="document-section" id="section-platform">${sectionTitle(index + 1, SECTION_LABELS[key])}<div class="fact-grid">${facts.map(([label, value]) => factItem(label, value)).join("")}</div>${text ? `<p>${escapeHTML(text)}</p>` : ""}</section>`;
    }
    if (key === "position") {
      const facts = [["招聘人数", section.headcount], ["主要方向", section.direction]];
      const text = [section.recruitmentBackground, section.positionSummary].filter(Boolean).join("\n\n");
      return `<section class="document-section" id="section-position">${sectionTitle(index + 1, SECTION_LABELS[key])}<div class="fact-grid">${facts.map(([label, value]) => factItem(label, value)).join("")}</div>${text ? `<p>${escapeHTML(text)}</p>` : ""}</section>`;
    }
    if (key === "requirements") {
      const fields = [
        ["专业方向", section.direction], ["学历要求", section.education], ["学位要求", section.degree],
        ["职称要求", section.title], ["年龄范围", section.age], ["执业资质", section.qualifications],
        ["临床经验", section.clinicalExperience], ["管理经验", section.managementExperience],
        ["学科建设", section.disciplineExperience], ["临床技术", section.clinicalSkills],
        ["科研要求", section.research], ["教学要求", section.teaching], ["其他条件", section.other],
      ];
      return `<section class="document-section" id="section-requirements">${sectionTitle(index + 1, SECTION_LABELS[key])}<div class="fact-grid">${fields.map(([label, value]) => factItem(label, value)).join("")}</div></section>`;
    }
    if (key === "compensation") {
      const text = [section.salaryEmployment, section.developmentSupport].filter(Boolean).join("\n\n");
      return `<section class="document-section" id="section-compensation">${sectionTitle(index + 1, SECTION_LABELS[key])}<p>${escapeHTML(text)}</p></section>`;
    }
    if (key === "policy") {
      return `<section class="document-section" id="section-policy">${sectionTitle(index + 1, SECTION_LABELS[key])}<p>${escapeHTML(section.text)}</p></section>`;
    }
    const settings = state.data.settings;
    return `<section class="document-section" id="section-application">${sectionTitle(index + 1, SECTION_LABELS[key])}<p>${escapeHTML(settings.applicationFlow)}</p><div class="contact-panel">${escapeHTML(settings.consultantTitle)}：${escapeHTML(settings.consultantName)}　｜　${escapeHTML(settings.phone)}　｜　微信：${escapeHTML(settings.wechat)}</div></section>`;
  }).join("");
}

function newestFirst(jobs) {
  return [...jobs].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function firstAvailable(jobs, path) {
  for (const job of newestFirst(jobs)) {
    const value = valueAt(job, path);
    if (String(value || "").trim()) return value;
  }
  return "";
}

function relatedJobRows(jobs) {
  if (!jobs.length) return `<div class="empty-state compact"><strong>暂无关联岗位</strong></div>`;
  return newestFirst(jobs).map((job) => `
    <button class="related-job-row" type="button" data-action="view-job" data-id="${escapeHTML(job.id)}">
      <div>
        <strong>${escapeHTML(job.role)}</strong>
        <small>${escapeHTML([job.organization, job.department, job.campus].filter(Boolean).join(" · "))}</small>
      </div>
      <span class="related-job-end"><span class="status-pill ${statusClass(job.status)}">${statusLabel(job.status)}</span><span class="row-link">查看岗位资料 <b>→</b></span></span>
    </button>`).join("");
}

function referenceDetailPage({ backAction, backLabel, actions = "", kicker, title, subtitle, metrics = [], sections = [], relatedTitle, relatedJobs }) {
  const visibleMetrics = metrics.filter(([, value]) => value);
  const visibleSections = sections.filter((section) => section.content);
  page(`
    <div class="detail-toolbar">
      <button class="quiet-button" type="button" data-action="${backAction}">← ${backLabel}</button>
      ${actions ? `<div class="button-row">${actions}</div>` : ""}
    </div>
    <article class="surface reference-document">
      <header class="reference-hero">
        <p class="document-kicker">${escapeHTML(kicker)}</p>
        <h1>${escapeHTML(title)}</h1>
        ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}
        ${visibleMetrics.length ? `<div class="metric-grid">${visibleMetrics.map(([label, value]) => `<div class="metric-tile"><strong>${escapeHTML(value)}</strong><span>${escapeHTML(label)}</span></div>`).join("")}</div>` : ""}
      </header>
      <div class="reference-content">
        ${visibleSections.map((section, index) => `
          <section class="document-section">
            ${sectionTitle(index + 1, section.title)}
            ${section.content}
          </section>`).join("")}
        <section class="document-section related-section">
          ${sectionTitle(visibleSections.length + 1, relatedTitle)}
          <div class="related-job-list">${relatedJobRows(relatedJobs)}</div>
        </section>
      </div>
    </article>
  `);
}

function cityHousingComparison(city, description) {
  if (city !== "宁波市") return description ? `<p class="comparison-copy">${escapeHTML(description)}</p>` : "";
  const benchmarks = [
    { city: "宁波", price: "16620元/㎡", width: 28, note: "约为杭州的48%" },
    { city: "杭州", price: "34529元/㎡", width: 57, note: "浙江省内对比" },
    { city: "上海", price: "60398元/㎡", width: 100, note: "长三角核心城市对比" },
  ];
  return `
    <div class="housing-comparison">
      ${benchmarks.map((item) => `<div class="housing-row">
        <div class="housing-label"><strong>${item.city}</strong><span>${item.price}</span></div>
        <div class="housing-track"><span style="width:${item.width}%"></span></div>
        <small>${item.note}</small>
      </div>`).join("")}
    </div>
    ${description ? `<p class="comparison-copy">${escapeHTML(description)}</p>` : ""}
    <p class="data-note">房价为2026年9月住宅挂牌均价，属于市场参考口径，不等同于官方成交均价。</p>`;
}

function insightPanel(label, text) {
  if (!text) return "";
  return `<div class="insight-panel"><span>${escapeHTML(label)}</span><p>${escapeHTML(text)}</p></div>`;
}

function renderCityDetail(city) {
  const jobs = state.data.jobs.filter((job) => job.city === city);
  if (!jobs.length) return navigate("cities");
  const field = (name) => firstAvailable(jobs, `sections.city.${name}`);
  const rankMetric = city === "宁波市" ? "省内第2｜全国第11" : field("gdpRank");
  const organizations = [...new Set(jobs.map((job) => job.organization).filter(Boolean))];
  const cityFacts = [
    ["城市定位", field("cityPosition")],
    ["常住人口", field("population")],
    ["GDP", field("gdp")],
    ["教育资源", field("education")],
    ["区位交通", field("transport")],
  ];
  const economyFacts = [
    ["省内及全国排名", field("gdpRank")],
    ["人均GDP", field("perCapitaGdp")],
    ["人均可支配收入", field("disposableIncome")],
    ["产业与经济特点", field("economy")],
  ];
  const hospitalLinks = organizations.length ? `
    <div class="reference-link-grid">${organizations.map((organization) => `
      <button class="reference-link-card" type="button" data-action="view-organization" data-id="${escapeHTML(organization)}">
        <span>医院资料</span><strong>${escapeHTML(organization)}</strong><small>查看医院、科室和关联岗位 →</small>
      </button>`).join("")}</div>` : "";

  referenceDetailPage({
    backAction: "go-cities",
    backLabel: "返回城市资料",
    kicker: "城市资料",
    title: city,
    subtitle: field("summary"),
    metrics: [["2025年GDP", field("gdp")], ["经济总量排名", rankMetric], ["居民人均可支配收入", field("disposableIncome")], ["住宅挂牌均价", field("housingPrice")]],
    sections: [
      { title: "城市概况", content: `<div class="fact-grid">${cityFacts.map(([label, value]) => factItem(label, value)).join("")}</div>` },
      { title: "经济位置与收入", content: `<div class="fact-grid">${economyFacts.map(([label, value]) => factItem(label, value)).join("")}</div>` },
      { title: "医疗资源与区域竞争", content: `<div class="fact-grid">${factItem("城市医疗资源", field("medical"))}</div>${insightPanel("竞争格局", field("medicalCompetition"))}` },
      { title: "住房成本对比", content: cityHousingComparison(city, field("housingComparison")) },
      { title: "猎头解读", content: insightPanel("向候选人怎么讲", field("attractiveness")) },
      { title: "相关医院", content: hospitalLinks },
    ],
    relatedTitle: "相关岗位",
    relatedJobs: jobs,
  });
}

function hospitalLocationComparison(organization, field) {
  if (organization !== "宁波市医疗中心李惠利医院") {
    return insightPanel("城市区位", field("locationPosition")) + insightPanel("交通通达", field("campusAccess"));
  }
  const campuses = [
    {
      name: "兴宁院区",
      tag: "成熟主城区",
      address: "鄞州区兴宁路57号",
      station: "宁波站约15—20分钟",
      airport: "机场约25—35分钟",
      copy: "位于传统主城区成熟生活圈，商业、居住和公共服务配套完善。",
    },
    {
      name: "东部院区",
      tag: "东部新城 / 高新区",
      address: "鄞州区江南路1111号",
      station: "宁波站约30—40分钟",
      airport: "机场约35—45分钟",
      copy: "位于城市东向发展轴，邻近东部新城行政商务区及高新区产业人才集聚区。",
    },
  ];
  return `
    <div class="campus-comparison">${campuses.map((campus) => `
      <article class="campus-card">
        <div class="campus-card-head"><strong>${campus.name}</strong><span>${campus.tag}</span></div>
        <p>${campus.copy}</p>
        <div class="campus-facts"><span>${campus.address}</span><span>${campus.station}</span><span>${campus.airport}</span></div>
      </article>`).join("")}</div>
    ${insightPanel("日常通勤", field("publicTransit"))}
    <p class="data-note">交通时间为常规驾车估算，实际时间受出发点、时段和路况影响。</p>`;
}

function hospitalScaleComparison(organization, description) {
  if (organization !== "宁波市医疗中心李惠利医院") {
    return description ? insightPanel("体量定位", description) : "";
  }
  const hospitals = [
    { name: "宁大附属第一医院", beds: "4400张", width: 100 },
    { name: "李惠利医院", beds: "2600张", width: 59, active: true },
    { name: "宁波市第二医院", beds: "2100张", width: 48 },
    { name: "宁大附属人民医院", beds: "1815张", width: 41 },
  ];
  return `
    <div class="scale-comparison">${hospitals.map((hospital) => `
      <div class="scale-row ${hospital.active ? "active" : ""}">
        <div class="scale-label"><strong>${hospital.name}</strong><span>${hospital.beds}</span></div>
        <div class="scale-track"><span style="width:${hospital.width}%"></span></div>
      </div>`).join("")}</div>
    ${description ? `<p class="comparison-copy">${escapeHTML(description)}</p>` : ""}
    <p class="data-note">比较采用各医院公开的核定床位口径；院区合并、扩建和统计时间不同可能影响绝对名次。</p>`;
}

function renderOrganizationDetail(organization) {
  const jobs = state.data.jobs.filter((job) => job.organization === organization);
  if (!jobs.length) return navigate("organizations");
  const field = (name) => firstAvailable(jobs, `sections.platform.${name}`);
  const departmentNames = [...new Set(jobs.map((job) => job.department).filter(Boolean))];
  const hospitalFacts = [
    ["医院性质", field("hospitalNature")], ["医院等级", field("grade")],
    ["医院类型", field("hospitalType")], ["大学属性", field("affiliation")],
    ["历史背景", field("history")], ["院区", field("campuses")],
    ["床位", field("beds")], ["体量定位", field("bedRank")], ["职工人数", field("staff")],
    ["业务量", field("visits")], ["绩效与学科地位", field("performance")],
    ["科研教学平台", field("research")],
  ];
  const departmentLinks = departmentNames.length ? `
    <div class="reference-link-grid">${departmentNames.map((department) => {
      const representative = newestFirst(jobs.filter((job) => job.department === department))[0];
      const count = jobs.filter((job) => job.department === department).length;
      return `<button class="reference-link-card" type="button" data-action="view-department" data-id="${escapeHTML(representative.id)}">
        <span>科室资料</span><strong>${escapeHTML(department)}</strong><small>${count} 条关联岗位 · 点击查看 →</small>
      </button>`;
    }).join("")}</div>` : "";

  referenceDetailPage({
    backAction: "go-organizations",
    backLabel: "返回医院科室",
    actions: `<button class="primary-button" type="button" data-action="new-organization-job" data-id="${escapeHTML(organization)}">＋ 新增该院岗位</button>`,
    kicker: `${firstAvailable(jobs, "city")} · 医院资料`,
    title: organization,
    subtitle: field("hospitalSummary"),
    metrics: [["医院等级", field("grade")], ["核定床位", field("beds")], ["同城体量", organization === "宁波市医疗中心李惠利医院" ? "综合三甲前二" : field("bedRank")], ["院区布局", organization === "宁波市医疗中心李惠利医院" ? "双院区" : field("campuses")]],
    sections: [
      { title: "医院概况", content: `<div class="fact-grid">${hospitalFacts.map(([label, value]) => factItem(label, value)).join("")}</div>` },
      { title: "院区区位与交通", content: hospitalLocationComparison(organization, field) },
      { title: "床位体量对比", content: hospitalScaleComparison(organization, field("scaleComparison")) },
      { title: "猎头解读", content: insightPanel("平台吸引力", field("platformAttractiveness")) },
      { title: "科室资料", content: departmentLinks },
    ],
    relatedTitle: "相关岗位",
    relatedJobs: jobs,
  });
}

function renderDepartmentDetail(jobId) {
  const sourceJob = state.data.jobs.find((job) => job.id === jobId);
  if (!sourceJob?.department) return navigate("organizations");
  const jobs = state.data.jobs.filter((job) => job.organization === sourceJob.organization && job.department === sourceJob.department);
  const field = (name) => firstAvailable(jobs, `sections.platform.${name}`);
  const departmentFacts = [
    ["科室名称", sourceJob.department], ["所在院区或位置", field("departmentLocation")],
    ["团队规模", field("team")], ["职称结构", field("titleStructure")],
    ["科室床位", field("departmentBeds")], ["业务量", field("departmentVolume")],
    ["亚专科与方向", field("specialties")], ["特色技术", field("technology")],
    ["学科或专科情况", field("discipline")], ["教学科研基础", field("teaching")],
  ];
  referenceDetailPage({
    backAction: "back-organization",
    backLabel: "返回医院资料",
    kicker: `${sourceJob.organization} · 科室资料`,
    title: sourceJob.department,
    subtitle: field("departmentSummary"),
    metrics: [["团队规模", field("team")], ["科室床位", field("departmentBeds")], ["关联岗位", `${jobs.length} 条`]],
    sections: [
      { title: "科室概况", content: `<div class="fact-grid">${departmentFacts.map(([label, value]) => factItem(label, value)).join("")}</div>` },
      { title: "所属医院", content: `<button class="organization-banner" type="button" data-action="view-organization" data-id="${escapeHTML(sourceJob.organization)}"><span>${escapeHTML(sourceJob.city)}</span><strong>${escapeHTML(sourceJob.organization)}</strong><small>查看完整医院资料 →</small></button>` },
    ],
    relatedTitle: "相关岗位",
    relatedJobs: jobs,
  });
}

function renderCities() {
  const grouped = new Map();
  state.data.jobs.forEach((job) => {
    if (!grouped.has(job.city)) grouped.set(job.city, []);
    grouped.get(job.city).push(job);
  });
  page(`
    <div class="page-heading"><div><p class="eyebrow">Cities</p><h1>城市资料</h1><p>城市信息会被同一城市的不同岗位重复调用。</p></div></div>
    <div class="summary-grid">
      ${[...grouped.entries()].map(([city, jobs]) => `<button class="surface summary-card" type="button" data-action="view-city" data-id="${escapeHTML(city)}"><span>城市</span><strong>${escapeHTML(city)}</strong><small>关联 ${jobs.length} 条岗位资料</small><b>查看城市资料 →</b></button>`).join("") || `<section class="surface empty-state"><strong>暂无城市资料</strong><p>建立岗位后，城市资料会自动出现在这里。</p></section>`}
    </div>
  `);
}

function renderOrganizations() {
  const grouped = new Map();
  state.data.jobs.forEach((job) => {
    if (!grouped.has(job.organization)) grouped.set(job.organization, []);
    grouped.get(job.organization).push(job);
  });
  page(`
    <div class="page-heading"><div><p class="eyebrow">Organizations</p><h1>医院科室</h1><p>查看医院、科室与岗位之间的关联关系。</p></div></div>
    <section class="surface reference-list">
      ${[...grouped.entries()].map(([organization, jobs]) => `<button class="reference-row" type="button" data-action="view-organization" data-id="${escapeHTML(organization)}"><div><strong>${escapeHTML(organization)}</strong><small>${escapeHTML([...new Set(jobs.map((job) => job.department).filter(Boolean))].join("、") || "尚未补充科室")}</small></div><span class="reference-row-end"><span class="status-pill">${jobs.length} 条岗位</span><b>查看 →</b></span></button>`).join("") || `<div class="empty-state"><strong>暂无医院资料</strong><p>建立岗位后，医院和科室会自动汇总。</p></div>`}
    </section>
  `);
}

function renderSettings() {
  const settings = state.data.settings;
  page(`
    <div class="page-heading"><div><p class="eyebrow">Settings</p><h1>个人设置</h1><p>联系人和应聘流程会自动出现在所有岗位资料中。</p></div></div>
    <section class="surface settings-form">
      <div class="surface-header"><strong>顾问信息</strong><span>全局统一使用</span></div>
      <form class="form-body" id="settings-form">
        <p class="settings-note">修改后会同步更新所有岗位资料的“应聘方式”，不需要逐条修改。</p>
        <div class="form-grid">
          ${inputField("consultantName", "顾问姓名", "", settings.consultantName, true)}
          ${inputField("consultantTitle", "身份", "", settings.consultantTitle, true)}
          ${inputField("phone", "联系电话", "", settings.phone, true)}
          ${inputField("wechat", "微信", "", settings.wechat, true)}
          <div class="field-group full"><label for="applicationFlow">统一应聘流程</label><textarea class="field-textarea" id="applicationFlow" name="applicationFlow">${escapeHTML(settings.applicationFlow)}</textarea></div>
        </div>
        <div class="button-row" style="margin-top:16px"><button class="primary-button" type="submit">保存个人设置</button></div>
      </form>
    </section>
  `);
}

function plainText(job) {
  const sections = [];
  sections.push(`${job.organization}\n${job.department ? `${job.department}｜` : ""}${job.role}\n`);
  const add = (title, text) => { if (text) sections.push(`${title}\n${text}\n`); };
  const city = job.sections.city;
  const cityText = [
    city.summary,
    city.gdpRank ? `经济排名：${city.gdpRank}` : "",
    city.perCapitaGdp ? `人均GDP：${city.perCapitaGdp}` : "",
    city.disposableIncome ? `居民人均可支配收入：${city.disposableIncome}` : "",
    city.medicalCompetition,
    city.housingComparison,
    city.attractiveness,
  ].filter(Boolean).join("\n");
  add("一、城市概况", cityText);
  const platform = job.sections.platform;
  add("二、平台背景", [
    platform.hospitalSummary,
    platform.locationPosition,
    platform.campusAccess,
    platform.scaleComparison,
    platform.platformAttractiveness,
    platform.departmentSummary,
  ].filter(Boolean).join("\n"));
  add("三、岗位定位", [job.sections.position.recruitmentBackground, job.sections.position.positionSummary].filter(Boolean).join("\n"));
  const requirementText = Object.entries(job.sections.requirements)
    .filter(([, value]) => value)
    .map(([key, value]) => `${requirementLabel(key)}：${value}`)
    .join("\n");
  add("四、任职要求", requirementText);
  add("五、薪酬与发展", [job.sections.compensation.salaryEmployment, job.sections.compensation.developmentSupport].filter(Boolean).join("\n"));
  add("六、人才政策", job.sections.policy.text);
  const settings = state.data.settings;
  add("七、应聘方式", `${settings.applicationFlow}\n${settings.consultantTitle}：${settings.consultantName}\n联系电话：${settings.phone}\n微信：${settings.wechat}`);
  return sections.join("\n");
}

function requirementLabel(key) {
  return ({
    direction: "专业方向", education: "学历要求", degree: "学位要求", title: "职称要求", age: "年龄范围",
    qualifications: "执业资质", clinicalExperience: "临床经验", managementExperience: "管理经验",
    disciplineExperience: "学科建设经验", clinicalSkills: "临床技术", research: "科研要求", teaching: "教学要求", other: "其他条件",
  })[key] || key;
}

async function copyJob(job) {
  try {
    await navigator.clipboard.writeText(plainText(job));
    showToast("完整岗位介绍已复制");
  } catch {
    showToast("浏览器未允许复制，请使用导出功能");
  }
}

function exportWord(job) {
  const safeTitle = `${job.organization}_${job.role}`.replace(/[\\/:*?"<>|]/g, "_");
  const content = plainText(job).split("\n").map((line) => line ? `<p>${escapeHTML(line)}</p>` : "<br>").join("");
  const html = `<html><head><meta charset="utf-8"><style>body{font-family:PingFang SC,Microsoft YaHei,sans-serif;line-height:1.65;color:#243746;margin:42px}p{margin:0 0 8px}</style></head><body>${content}</body></html>`;
  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeTitle}.doc`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("岗位介绍已导出为Word兼容文件");
}

function parseSmartIntake(rawText) {
  const text = String(rawText || "").replace(/\r/g, "").trim();
  const fields = {};
  if (!text) return { fields, count: 0 };

  const clauses = text
    .split(/[\n。；;，,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const put = (path, value) => {
    const cleanValue = String(value || "").trim().replace(/^[：:、\s]+|[：:、\s]+$/g, "");
    if (cleanValue) fields[path] = cleanValue;
  };
  const matchingClauses = (keywords) => clauses.filter((clause) => keywords.some((keyword) => clause.includes(keyword)));
  const combineClauses = (keywords) => [...new Set(matchingClauses(keywords))].join("；");
  const firstMatch = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1];
    }
    return "";
  };

  const headcount = firstMatch([
    /(?:招聘|引进|拟招|急招|需求|招)\s*[^，。；;\n]{0,30}?(\d+|[一二三四五六七八九十两]+)\s*(?:名|人)/,
    /(?:招聘人数|需求人数|人数)\s*[：:]?\s*(\d+|[一二三四五六七八九十两]+)\s*(?:名|人)?/,
  ]);
  if (headcount) put("sections.position.headcount", `${headcount}人`);

  const direction = firstMatch([
    /(?:招聘|引进|拟招|急招|招)\s*([\u4e00-\u9fa5A-Za-z0-9·]{2,18}?)(?:学科)?带头人/,
    /([\u4e00-\u9fa5A-Za-z0-9·]{2,18}(?:科|学|专业))(?:相关)?方向/,
    /(?:专业方向|专业要求|学科方向)\s*[：:]\s*([^，。；;\n]{2,24})/,
  ]);
  if (direction) {
    put("sections.position.direction", direction);
    put("sections.requirements.direction", direction);
  }

  const background = combineClauses(["发展需要", "学科发展", "新院区", "扩建", "扩科", "岗位空缺", "人才梯队", "退休", "招聘背景", "引进原因"]);
  if (background) put("sections.position.recruitmentBackground", background);
  const positionSummary = combineClauses(["岗位定位", "岗位职责", "主要职责", "负责", "牵头", "担任"]);
  if (positionSummary) put("sections.position.positionSummary", positionSummary);

  let education = firstMatch([
    /((?:博士|硕士)(?:研究生)?(?:及以上|以上)?学历)/,
    /((?:博士|硕士)研究生(?:及以上|以上)?)/,
    /((?:大学)?本科(?:及以上|以上)?学历)/,
    /(大专(?:及以上|以上)?学历)/,
  ]);
  if (education && !education.includes("学历")) education += "学历";
  const studyMode = firstMatch([
    /((?:接受|可接受)(?:在职|非全日制))/,
    /((?:在职|非全日制)(?:也可|均可|可以|可接受|可))/,
    /((?:在职|非全日制))(?=(?:博士|硕士)研究生)/,
    /(不限全日制)/,
    /(全日制)/,
  ]);
  if (education && studyMode) education = `${education}，${studyMode}`;
  put("sections.requirements.education", education);

  let degree = firstMatch([
    /((?:博士|硕士|学士)(?:及以上|以上)?学位)/,
    /学位(?:要求)?\s*[：:]\s*([^，。；;\n]{2,16})/,
  ]);
  if (!degree && education) {
    const level = education.match(/(博士|硕士)/)?.[1];
    if (level) degree = level === "博士" ? "博士学位" : `${level}${education.includes("及以上") || education.includes("以上") ? "及以上" : ""}学位`;
  }
  put("sections.requirements.degree", degree);
  put("sections.requirements.title", firstMatch([
    /((?:主任医师|副主任医师|主治医师|正高级|副高级|高级)(?:职称)?(?:及以上|以上|优先)?)/,
    /职称(?:要求)?\s*[：:]\s*([^，。；;\n]{2,18})/,
  ]));
  put("sections.requirements.age", firstMatch([
    /(\d{2}\s*(?:周?岁)?(?:及以下|以下|以内|左右))/,
    /年龄(?:要求)?\s*[：:]?\s*([^，。；;\n]{2,18})/,
  ]));

  const requirementRules = [
    ["sections.requirements.qualifications", ["执业医师", "医师资格", "资格证", "执业资格", "规培证", "住院医师规范化培训"]],
    ["sections.requirements.clinicalExperience", ["临床经验", "临床工作", "临床和", "三甲医院工作", "三级医院工作"]],
    ["sections.requirements.managementExperience", ["科室管理", "医院管理", "团队管理", "管理经验"]],
    ["sections.requirements.disciplineExperience", ["学科建设", "团队建设", "人才梯队", "专科建设"]],
    ["sections.requirements.clinicalSkills", ["临床技术", "技术专长", "手术能力", "熟练掌握", "擅长"]],
    ["sections.requirements.teaching", ["教学", "带教", "博士生导师", "硕士生导师", "博导", "硕导"]],
  ];
  requirementRules.forEach(([path, keywords]) => put(path, combineClauses(keywords)));
  const researchRequirement = matchingClauses(["科研", "课题", "基金", "论文", "科研成果"])
    .filter((clause) => !/(科研经费|启动经费|科研平台|资源支持)/.test(clause))
    .join("；");
  put("sections.requirements.research", researchRequirement);

  const otherParts = [combineClauses(["其他要求", "其他条件", "特别优秀", "优先考虑"]), !education ? studyMode : ""].filter(Boolean);
  const other = [...new Set(otherParts)].join("；");
  if (other) put("sections.requirements.other", other);

  const salaryEmployment = combineClauses(["年薪", "月薪", "薪酬", "工资", "待遇", "绩效", "事业编", "编制", "聘用", "合同制"]);
  if (salaryEmployment) put("sections.compensation.salaryEmployment", salaryEmployment);
  const developmentSupport = combineClauses(["科研经费", "启动经费", "团队配置", "团队支持", "科研平台", "发展平台", "晋升", "职称评聘"]);
  if (developmentSupport) put("sections.compensation.developmentSupport", developmentSupport);
  const policy = combineClauses(["安家费", "人才补贴", "生活补贴", "购房补贴", "住房", "落户", "子女入学", "子女教育", "配偶安置", "人才政策"]);
  if (policy) put("sections.policy.text", policy);

  return { fields, count: Object.keys(fields).length };
}

function mergeMissing(target, source) {
  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === "object") {
      if (!target[key]) target[key] = {};
      mergeMissing(target[key], value);
    } else if (!target[key] && value) {
      target[key] = value;
    }
  });
}

document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) return navigate(routeButton.dataset.route);

  const anchor = event.target.closest("[data-anchor]");
  if (anchor) {
    event.preventDefault();
    document.getElementById(anchor.dataset.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const { action, id, section } = actionButton.dataset;

  if (action === "reload-app") return location.reload();
  if (action === "logout") return void logout();
  if (action === "new-job") return navigate("new");
  if (action === "import-source-job") {
    const sourceJob = state.sourceJobs.find((job) => job.id === id);
    if (!sourceJob) return;
    state.workingJob = buildImportedJob(sourceJob);
    state.editorSection = "city";
    showToast("已带入岗位运营基础信息，并生成待检查的资料草稿");
    return navigate(`edit/${id}`);
  }
  if (action === "new-organization-job") return navigate(`new/${encodeURIComponent(id)}`);
  if (action === "go-jobs") return navigate("jobs");
  if (action === "go-cities") return navigate("cities");
  if (action === "go-organizations") return navigate("organizations");
  if (action === "view-job") return navigate(`job/${id}`);
  if (action === "view-city") return navigate(`city/${encodeURIComponent(id)}`);
  if (action === "view-organization") return navigate(`organization/${encodeURIComponent(id)}`);
  if (action === "view-department") return navigate(`department/${encodeURIComponent(id)}`);
  if (action === "back-organization") {
    const sourceJob = state.data.jobs.find((job) => job.id === parseRoute().id);
    return navigate(sourceJob ? `organization/${encodeURIComponent(sourceJob.organization)}` : "organizations");
  }
  if (action === "edit-job") return navigate(`edit/${id}`);
  if (action === "archive-job") {
    const job = state.data.jobs.find((item) => item.id === id);
    if (!job) return;
    job.archivedFromStatus = job.status;
    job.status = "archived";
    job.updatedAt = today();
    saveData();
    showToast("岗位已停止招聘并移入归档");
    return renderJobDetail(id);
  }
  if (action === "restore-job") {
    const job = state.data.jobs.find((item) => item.id === id);
    if (!job) return;
    job.status = job.archivedFromStatus === "draft" ? "draft" : "saved";
    delete job.archivedFromStatus;
    job.updatedAt = today();
    saveData();
    showToast("岗位已恢复招聘");
    return renderJobDetail(id);
  }
  if (action === "go-settings") return navigate("settings");
  if (action === "open-smart-intake") {
    const dialog = document.getElementById("smart-intake-dialog");
    if (!dialog) return;
    dialog.showModal();
    requestAnimationFrame(() => document.getElementById("smart-intake-text")?.focus());
    return;
  }
  if (action === "close-smart-intake") {
    document.getElementById("smart-intake-dialog")?.close();
    return;
  }
  if (action === "apply-smart-intake") {
    const textarea = document.getElementById("smart-intake-text");
    const text = textarea?.value.trim() || "";
    if (!text) {
      showToast("请先粘贴客户发来的岗位需求");
      textarea?.focus();
      return;
    }
    const result = parseSmartIntake(text);
    Object.entries(result.fields).forEach(([path, value]) => setAt(state.workingJob, path, value));
    state.workingJob.sourceBrief = text;
    document.getElementById("smart-intake-dialog")?.close();
    state.editorSection = "requirements";
    renderEditor();
    showToast(result.count ? `已识别并填入 ${result.count} 个字段，请检查确认` : "已保留客户原文，暂未识别到明确字段");
    return;
  }
  if (action === "cancel-edit") {
    const existing = state.data.jobs.some((job) => job.id === state.workingJob?.id);
    state.workingJob = null;
    return navigate(existing ? `job/${id || parseRoute().id}` : "jobs");
  }
  if (action === "editor-section") {
    state.editorSection = section;
    return renderEditor();
  }
  if (action === "previous-section") {
    const index = SECTION_ORDER.indexOf(state.editorSection);
    if (index > 0) state.editorSection = SECTION_ORDER[index - 1];
    return renderEditor();
  }
  if (action === "next-section") {
    const index = SECTION_ORDER.indexOf(state.editorSection);
    if (index === SECTION_ORDER.length - 1) return saveWorkingJob();
    state.editorSection = SECTION_ORDER[index + 1];
    return renderEditor();
  }
  if (action === "save-job") return saveWorkingJob();
  if (action === "clear-section") {
    state.workingJob.sections[state.editorSection] = emptySections()[state.editorSection];
    return renderEditor();
  }
  if (action === "blank-draft") {
    const base = readNewJobForm();
    if (!base) return;
    state.workingJob = { ...base, id: makeId(base), status: "draft", updatedAt: today(), sections: buildNewJobSections(base, false) };
    state.editorSection = "city";
    return navigate("edit/new");
  }
  if (action === "copy-job") {
    const job = state.data.jobs.find((item) => item.id === id);
    if (job) copyJob(job);
    return;
  }
  if (action === "export-word") {
    const job = state.data.jobs.find((item) => item.id === id);
    if (job) exportWord(job);
    return;
  }
  if (action === "ai-update") {
    const job = state.data.jobs.find((item) => item.id === id);
    if (!job) return;
    state.workingJob = clone(job);
    mergeMissing(state.workingJob.sections, createCollectedSections(job));
    state.editorSection = "city";
    showToast("已补充可识别的公开资料，请检查后保存");
    return navigate(`edit/${id}`);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-field]") && state.workingJob) {
    setAt(state.workingJob, event.target.dataset.field, event.target.value);
  }
  if (event.target.id === "job-search") {
    state.search = event.target.value;
    clearTimeout(window.__jobSearchTimer);
    window.__jobSearchTimer = setTimeout(renderJobs, 120);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "city-filter") {
    state.cityFilter = event.target.value;
    renderJobs();
  }
  if (event.target.id === "status-filter") {
    state.statusFilter = event.target.value;
    renderJobs();
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "new-job-form") {
    event.preventDefault();
    const base = readNewJobForm();
    if (base) startCollection(base);
  }
  if (event.target.id === "settings-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    state.data.settings = {
      consultantName: String(data.get("consultantName") || "").trim(),
      consultantTitle: String(data.get("consultantTitle") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      wechat: String(data.get("wechat") || "").trim(),
      applicationFlow: String(data.get("applicationFlow") || "").trim(),
    };
    saveData();
    document.getElementById("header-consultant-name").textContent = state.data.settings.consultantName;
    showToast("个人设置已保存，并同步到所有岗位");
  }
});

document.getElementById("mobile-menu").addEventListener("click", () => {
  document.getElementById("app-sidebar").classList.toggle("open");
});

window.addEventListener("hashchange", renderRoute);
bootstrapApp();
