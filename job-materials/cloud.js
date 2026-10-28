(function initializeCloudClient() {
  const config = window.JOB_MATERIALS_CONFIG;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase?.createClient) {
    throw new Error("Supabase 云端配置未正确加载");
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  function wait(delay) {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  function isTransientNetworkError(error) {
    const message = String(error?.message || error || "");
    return error?.name === "TypeError" || /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message);
  }

  async function requestWithNetworkRetry(request, attempts = 4) {
    let lastResult;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        lastResult = await request();
        if (!lastResult?.error || !isTransientNetworkError(lastResult.error)) return lastResult;
      } catch (error) {
        if (!isTransientNetworkError(error) || attempt === attempts - 1) throw error;
        lastResult = { data: null, error };
      }

      if (attempt < attempts - 1) await wait(500 * (2 ** attempt));
    }
    return lastResult;
  }

  function readableError(error, fallback) {
    const message = String(error?.message || "");
    if (message.includes("Invalid login credentials")) return "登录账号或密码不正确";
    if (message.includes("Email not confirmed")) return "该账号尚未完成邮箱验证";
    if (message.includes("MATERIAL_VERSION_CONFLICT")) return "资料已在其他设备更新，请刷新后再编辑";
    if (message.includes("get_job_materials_workspace") || message.includes("save_job_materials_workspace")) {
      return "岗位资料数据库尚未初始化，请先执行数据库迁移";
    }
    return message || fallback;
  }

  async function loadUnmaterializedJobs(materialJobs) {
    const [jobsResult, hospitalsResult, requirementsResult] = await Promise.all([
      requestWithNetworkRetry(() => client
        .from("jobs")
        .select("id, hospital_id, department, role, status, raw_text, compensation_policy, updated_at")
        .eq("status", "招聘中")
        .order("updated_at", { ascending: false })),
      requestWithNetworkRetry(() => client
        .from("hospitals")
        .select("id, standard_name, city")),
      requestWithNetworkRetry(() => client
        .from("job_requirements")
        .select("job_id, kind, dimension, normalized_value, source_text")
        .eq("is_active", true)),
    ]);

    const error = jobsResult.error || hospitalsResult.error || requirementsResult.error;
    if (error) throw new Error(readableError(error, "暂时无法读取岗位运营数据"));

    const materialJobIds = new Set(materialJobs.map((job) => job.id));
    const hospitals = new Map((hospitalsResult.data || []).map((hospital) => [hospital.id, hospital]));
    const requirementsByJob = new Map();
    (requirementsResult.data || []).forEach((requirement) => {
      const items = requirementsByJob.get(requirement.job_id) || [];
      items.push({
        kind: requirement.kind || "",
        dimension: requirement.dimension || "",
        value: requirement.normalized_value || "",
        sourceText: requirement.source_text || "",
      });
      requirementsByJob.set(requirement.job_id, items);
    });

    return (jobsResult.data || [])
      .filter((job) => !materialJobIds.has(job.id))
      .map((job) => {
        const hospital = hospitals.get(job.hospital_id) || {};
        return {
          id: job.id,
          city: hospital.city || "",
          organization: hospital.standard_name || "医院待补充",
          department: job.department || "",
          role: job.role || "",
          operationsStatus: job.status || "",
          updatedAt: String(job.updated_at || "").slice(0, 10),
          sourceBrief: job.raw_text || "",
          compensationPolicy: job.compensation_policy || "",
          requirements: requirementsByJob.get(job.id) || [],
        };
      });
  }

  window.materialsCloud = Object.freeze({
    async session() {
      const { data, error } = await requestWithNetworkRetry(() => client.auth.getSession());
      if (error) throw new Error(readableError(error, "无法读取登录状态"));
      return data.session;
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(readableError(error, "登录失败，请稍后重试"));
      return data.session;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw new Error(readableError(error, "退出登录失败"));
    },

    async loadWorkspace() {
      const { data, error } = await requestWithNetworkRetry(() => client.rpc("get_job_materials_workspace"));
      if (error) throw new Error(readableError(error, "暂时无法读取岗位资料"));
      const workspace = data && typeof data === "object" ? data : {};
      const jobs = Array.isArray(workspace.jobs) ? workspace.jobs : [];
      let sourceJobs = [];
      try {
        sourceJobs = await loadUnmaterializedJobs(jobs);
      } catch (sourceError) {
        console.warn("岗位运营数据暂时无法读取", sourceError);
      }
      return {
        data: {
          jobs,
          sourceJobs,
          settings: workspace.settings && typeof workspace.settings === "object" ? workspace.settings : {},
        },
        revision: Number(workspace.revision || 0),
      };
    },

    async saveWorkspace(data, expectedRevision) {
      const { data: result, error } = await client.rpc("save_job_materials_workspace", {
        p_workspace: data,
        p_expected_revision: expectedRevision,
      });
      if (error) throw new Error(readableError(error, "岗位资料保存失败"));
      return {
        revision: Number(result?.revision || expectedRevision + 1),
        updatedAt: result?.updatedAt || new Date().toISOString(),
      };
    },
  });
})();
