function openCard(id) {
    if (!isUnlocked()) return;

    document.getElementById("cardGrid").classList.add("hidden");
    document.querySelectorAll(".card-content").forEach(c =>
        c.classList.add("hidden")
    );
    document.getElementById(id).classList.remove("hidden");
}

function goBack() {
    document.querySelectorAll(".card-content").forEach(c =>
        c.classList.add("hidden")
    );
    document.getElementById("cardGrid").classList.remove("hidden");
}