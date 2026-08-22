// --------------------
// ボタン
// --------------------

const helloButton = document.getElementById("helloButton");

helloButton.addEventListener("click", () => {
    alert("button");
});

const soundcloud = document.getElementById("soundcloud-button");

soundcloud.addEventListener("click", () => {
    window.open('https://soundcloud.com/ale_shi?utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing', '_blank', 'noopener,noreferrer');
});

const youtubeButton = document.getElementById("youtube-button");

youtubeButton.addEventListener("click", () => {
    window.open(
        "https://www.youtube.com/@ale_shi",
        "_blank",
        "noopener,noreferrer"
    );
});

const twitterbutton = document.getElementById("twitter-button");

twitterbutton.addEventListener("click", () => {
    window.open(
        "https://x.com/Ale16a1",
        "_blank",
        "noopener,noreferrer"
    );
});


const bilibiliButton = document.getElementById("bilbili-button");

bilibiliButton.addEventListener("click", () => {
    window.open(
        "https://space.bilibili.com/3706958922123598/upload/video",
        "_blank",
        "noopener,noreferrer"
    );
});

// --------------------
// スクロールで出現
// --------------------

const revealElements = document.querySelectorAll(".scroll-reveal");

const observer = new IntersectionObserver(
    (entries) => {

        entries.forEach((entry) => {

            if (entry.isIntersecting) {

                entry.target.classList.add("visible");

                // 一度表示したら監視をやめる
                observer.unobserve(entry.target);
            }

        });

    },
    {
        threshold: 0.15
    }
);


revealElements.forEach((element) => {
    observer.observe(element);
});

//----------------

const backgroundVideo = document.getElementById("background-video");

let targetX = 0;
let targetY = 0;

let currentX = 0;
let currentY = 0;

document.addEventListener("mousemove", (event) => {

    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;

    targetX = x * -30;
    targetY = y * -30;
});


function animateBackground() {

    currentX += (targetX - currentX) * 0.15;
    currentY += (targetY - currentY) * 0.15;

    backgroundVideo.style.transform =
        `translate(
            calc(-50% + ${currentX}px),
            calc(-50% + ${currentY}px)
        )`;

    requestAnimationFrame(animateBackground);
}

animateBackground();

window.addEventListener("load", () => {
    setTimeout(() => {
        document.querySelector(".letterbox").classList.add("open");
    }, 100);
});
