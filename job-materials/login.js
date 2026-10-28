const form = document.getElementById("login-form");
const errorMessage = document.getElementById("login-error");

materialsCloud.session().then((session) => {
  if (session) location.replace("./index.html");
}).catch(() => {});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = form.querySelector("button[type='submit']");
  const data = new FormData(form);
  errorMessage.textContent = "";
  submitButton.disabled = true;
  submitButton.textContent = "正在登录…";

  try {
    await materialsCloud.signIn(
      String(data.get("username") || "").trim(),
      String(data.get("password") || ""),
    );
    location.replace("./index.html");
  } catch (error) {
    errorMessage.textContent = error.message;
    submitButton.disabled = false;
    submitButton.textContent = "登录平台";
  }
});
