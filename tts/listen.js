console.log("content script")
var alltext = $("h1:visible, h2:visible, h3:visible, h4:visible, h5:visible, h6:visible").text()
    // console.log(typeof(alltext))
chrome.storage.local.set({"headings": alltext}, () => {
    console.log(alltext)
})
