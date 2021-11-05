if ('speechSynthesis' in window) {
console.log("hello this is logging")
}
let btn = document.getElementById("speakout")

btn.onclick = () => {
    console.log("clicked")
    chrome.storage.local.get(["headings"], (result) => {
        console.log(result.headings)
        let msg = new SpeechSynthesisUtterance()
        msg.text = result.headings
        speechSynthesis.speak(msg)
    })
}