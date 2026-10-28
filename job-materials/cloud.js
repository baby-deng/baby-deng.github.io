(function initializeCloudClient() {
  const config = window.JOB_MATERIALS_CONFIG;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase?.createClient) {
    throw new Error("Supabase 云端配置未正确加载");
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

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

  window.materialsCloud = Object.freeze({
    async session() {
      const { data, error } = await client.auth.getSession();
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
      const { data, error } = await client.rpc("get_job_materials_workspace");
      if (error) throw new Error(readableError(error, "暂时无法读取岗位资料"));
      const workspace = data && typeof data === "object" ? data : {};
      return {
        data: {
          jobs: Array.isArray(workspace.jobs) ? workspace.jobs : [],
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
