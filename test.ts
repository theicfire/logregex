import { FileHandler, LogRegex, Matcher } from "./index";
function ex2() {
  const file = new FileHandler("a,b,b,b,c,a,d".split(","));
  const lre = new LogRegex("Blah");
  lre.matchAllRepeat();
  lre.match("b");
  lre.matchAllRepeat();
  lre.match("a");
  //   lre.describe();
  //   console.log('====');
  const matcher = new Matcher();
  console.assert(matcher.match(file, lre), "ex2");
}

function ex3() {
  const file = new FileHandler("a,b,c,a,f,f,c".split(","));
  const lre = new LogRegex("Blah");
  lre.matchAllRepeat();
  lre.match("a");
  lre.unmatchRepeat("b");
  lre.match("c");
  //   lre.describe();
  //   console.log('====');
  const matcher = new Matcher();
  console.assert(matcher.match(file, lre), "ex3");
}

function ex4() {
  const file = new FileHandler("a,b,c".split(","));
  const lre = new LogRegex("Blah");
  lre.matchAllRepeat();
  lre.match("a");
  lre.unmatchRepeat("b");
  lre.match("c");
  //   lre.describe();
  //   console.log('====');
  const matcher = new Matcher();
  console.assert(!matcher.match(file, lre), "ex4");
}

function ex5() {
  const file = new FileHandler("a,a,a,b,a,a,b,c".split(","));
  const lre = new LogRegex("Blah");
  lre.matchAllRepeat();
  lre.match("a");
  lre.unmatchRepeat("b");
  lre.match("c");
  //   lre.describe();
  //   console.log('====');
  const matcher = new Matcher();
  console.assert(!matcher.match(file, lre), "ex5");
}

function ex6() {
  const file = new FileHandler("a,c".split(","));
  const lre = new LogRegex("Blah");
  lre.matchAllRepeat();
  lre.match("a");
  lre.unmatchRepeat("b");
  lre.match("c");
  //   lre.describe();
  //   console.log('====');
  const matcher = new Matcher();
  console.assert(matcher.match(file, lre), "ex6");
}

function ex7() {
  const file = new FileHandler("a,a,a,b,c".split(","));
  const lre = new LogRegex("Blah");
  lre.matchAllRepeat();
  lre.match("a");
  lre.unmatchRepeat("b");
  lre.match("c");
  //   lre.describe();
  //   console.log('====');
  const matcher = new Matcher();
  console.assert(!matcher.match(file, lre), "ex5");
}

function ex1() {
  const lre = new LogRegex("Duplicate Resize");
  lre.matchAllRepeat();
  const group = lre.match(
    "Calling onWindowResize for window (.*) to origin .* on screen .* with size (.*)"
  );
  lre.unmatchRepeat("Calling onWindowResize for window {} to", "<20s", [
    group.at(1),
  ]);
  lre.match(
    "Calling onWindowResize for window {} to origin .* on screen .* with size {}",
    "<20s",
    [group.at(1), group.at(2)]
  );
  lre.matchAllRepeat();
  lre.match("Gray screen for {}", "<20s", [group.at(1)]);
  const matcher = new Matcher();
  matcher.execute(["/path/to/file.log"], [lre]);
}

function ex8() {
  const contents = `
  T00 dog is big and black
  T40 color is black
  T60 dog is big and black
  `;
  const s1 = "dog is big and black";
  const s2 = "size is big";
  const s3 = "color is black";

  const true_tests = [];
  const false_tests = [];
  true_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match(s1);
  });
  true_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match(s3);
  });
  true_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match(s1);
    lre.matchAllRepeat();
    lre.match(s3);
  });
  true_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match(s1);
    lre.unmatchRepeat(s2);
    lre.match(s3);
  });
  true_tests.push((lre: LogRegex) => {
    lre.unmatchRepeat(s1);
    lre.unmatchRepeat(s2);
    lre.unmatchRepeat(s3);
    lre.match(s1);
    lre.unmatchRepeat(s2);
    lre.match(s3);
  });
  true_tests.push((lre: LogRegex) => {
    lre.unmatchRepeat(s1);
    lre.match(s1);
    lre.unmatchRepeat(s2);
    lre.match(s3);
  });
  true_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match(s3);
    lre.matchAllRepeat();
    lre.match(s1);
  });

  false_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match(s2);
  });
  false_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match(s3);
    lre.matchAllRepeat();
    lre.match(s3);
  });
  false_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match(s1);
    lre.matchAllRepeat();
    lre.match(s2);
  });
  false_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match(s1);
    lre.unmatchRepeat(s3);
    lre.match(s1);
  });
  false_tests.push((lre: LogRegex) => {
    lre.unmatchRepeat(s1);
    lre.match(s3);
  });

  const file = new FileHandler(contents.split("\n"));
  const matcher = new Matcher();

  for (const [loc, test] of true_tests.entries()) {
    const lre = new LogRegex("Blah");
    test(lre);
    if (!matcher.match(file, lre)) {
      console.log(`Error: failed true test: #${loc}`);
      console.log(test);
    }
  }

  for (const [loc, test] of false_tests.entries()) {
    const lre = new LogRegex("Blah");
    test(lre);
    if (matcher.match(file, lre)) {
      console.log(`Error: failed false test: #${loc}`);
      console.log(test);
    }
  }
}

function ex9() {
  const contents = `
  T00 dog is big and black
  T40 color is black
  T60 cat is small and white
  T80 color is orange
  T80 color is white
  T80 color is purple
  T80 color is white
  T80 size is small
  `;
  const s1 = "dog is (.*) and (.*)";
  const s2 = "size is {}";
  const s3 = "color is {}";

  const true_tests = [];
  true_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    const group = lre.match("dog is (.*) and (.*)");
    lre.matchAllRepeat();
    lre.match("color is {}", "<20s", [group.at(1)]);
  });
  true_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    const group = lre.match("cat is (.*) and (.*)");
    lre.matchAllRepeat();
    lre.match("color is {}", "<80s", [group.at(1)]);
  });
  true_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    lre.match("dog is (.*) and (.*)");
    lre.matchAllRepeat();
    const group2 = lre.match("cat is (.*) and (.*)");
    lre.matchAllRepeat();
    lre.match("color is {}", "<20s", [group2.at(1)]);
    lre.matchAllRepeat();
    lre.match("size is {}", "<20s", [group2.at(0)]);
  });
  true_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    const group = lre.match("color is (.*)");
    lre.matchAllRepeat();
    lre.match("color is {}", "<20s", [group.at(0)]);
  });

  const false_tests = [];
  false_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    const group = lre.match("dog is (.*) and (.*)");
    lre.matchAllRepeat();
    lre.match("color is {}", "<20s", [group.at(2)]); // at (2) is wrong
  });
  false_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    const group = lre.match("dog is (.*) and (.*)");
    lre.unmatchRepeat("color is .*");
    lre.unmatchRepeat("cat is .*");
    lre.matchAllRepeat();
    lre.match("color is {}", "<20s", [group.at(2)]); // at (2) is wrong
  });

  const file = new FileHandler(contents.split("\n"));
  const matcher = new Matcher();

  for (const [loc, test] of true_tests.entries()) {
    const lre = new LogRegex("Blah");
    test(lre);
    if (!matcher.match(file, lre)) {
      console.log(`Error: failed true test: #${loc}`);
      console.log(test);
    }
  }

  for (const [loc, test] of false_tests.entries()) {
    const lre = new LogRegex("Blah");
    test(lre);
    if (matcher.match(file, lre)) {
      console.log(`Error: failed false test: #${loc}`);
      console.log(test);
    }
  }

  {
    const lre = new LogRegex("Blah");
    const group = lre.match("dog is (.*) and (.*)");
    let hitException = false;
    try {
      group.at(3);
    } catch (e) {
      hitException = true;
    }
    console.assert(hitException, "Should have thrown exception");
  }
}

function ex10() {
  const contents = `
  2021-11-22T19:18:47.940Z [94377:c++] ::(anonymous class)::operator()() const - [gs] Making window 0x48004b5 gray. Expecting frame with 1920x1058@1
2021-11-22T19:18:47.941Z [94377:c++]  const - Calling onWindowResize for window 0x48004b5 to origin (0, 23) on screen 722474267 with size 1920x1057@1
2021-11-22T19:18:47.942Z [94377:js]  - call_window_resize for 0x48004b5 with 1920x1057@1
2021-11-22T19:18:51.591Z [94377:c++] info: window_delegate.mm:173:auto WindowDelegate::windowDidMove:::(anonymous class)::operator()() const - Calling onWindowMove for 0x48004b5 (33, 28, 722474524)
2021-11-22T19:18:51.641Z [94377:c++]  const - Calling onWindowResize for window 0x48004b5 to origin (0, 23) on screen 722474524 with size 1920x1057@1
2021-11-22T19:18:51.642Z [94377:js] info: index.js:1:Client.call_window_resize - call_window_resize for 0x48004b5 with 1920x1057@1
2021-11-22T19:18:56.854Z [94377:c++] error: decode_render.mm:1013:fast::DecodeRender::Context::didDecompress - window 75498677: Error decompressing frame at time: 0 error: -12909 infoFlags: 0
2021-11-22T19:18:56.867Z [94377:c++] info: metal_renderer.cpp:301:log_gray_screen@renderer - Window 0x48004b5 info:
Expecting frame with props:1920x1058x1
2021-11-22T19:18:56.869Z [94377:c++] warning: metal_renderer.cpp:320:log_gray_screen@renderer - [Sentry] User is seeing a gray screen! network_poor_condition: false, encoder_resetting: false
2021-11-22T19:18:56.869Z [94377:c++] error: decode_render.mm:1013:fast::DecodeRender::Context::didDecompress - window 75498677: Error decompressing frame at time: 0 error: -12909 infoFlags: 0
`;
  const lre = new LogRegex("Blah");
  lre.matchAllRepeat();
  const group = lre.match("Calling onWindowResize for window ([^ ]*)");
  lre.matchAllRepeat();
  lre.match("Calling onWindowResize for window {}", "<20s", [group.at(0)]);
  lre.matchAllRepeat();
  lre.match("Window {} info:", "<20s", [group.at(0)]);
  lre.match("Expecting frame with");
  lre.match("User is seeing a gray screen!");
  const file = new FileHandler(contents.split("\n"));
  const matcher = new Matcher();
  if (!matcher.match(file, lre)) {
    console.log("Error: failed ex10");
  }
}

function generateExample() {
  const letters = ["a", "b", "c"];
  const isMatches = [true, false];
  const matchLen = Math.ceil(Math.random() * 10);
  const lre = new LogRegex("Blah");
  let wasIsMatch = true;
  let regexString = "^";
  let codeString = "";
  for (let i = 0; i < matchLen; i++) {
    const letter = letters[Math.floor(Math.random() * letters.length)];
    const isMatch = isMatches[Math.floor(Math.random() * isMatches.length)];
    if (isMatch) {
      if (wasIsMatch) {
        codeString += "lre.matchAllRepeat();\n";
        lre.matchAllRepeat();
      }
      lre.match(letter);
      codeString += `lre.match('${letter}');\n`;
      if (wasIsMatch) {
        regexString += `.*${letter}`;
      } else {
        regexString += `${letter}`;
      }
      wasIsMatch = true;
    } else {
      lre.unmatchRepeat(letter);
      codeString += `lre.unmatch_repeat('${letter}');\n`;
      regexString += `[^${letter}]*`;
      wasIsMatch = false;
    }
  }
  const fileLen = Math.ceil(Math.random() * 100);
  const lines = [];
  for (let i = 0; i < fileLen; i++) {
    lines.push(letters[Math.floor(Math.random() * letters.length)]);
  }
  const matcher = new Matcher();
  const expected_match = new RegExp(regexString).test(lines.join(""));
  const does_match = matcher.match(new FileHandler(lines), lre);
  if (expected_match !== does_match) {
    console.log(`\n\n\nFail for ${regexString}`);
    console.log(`${codeString}`);
    console.log(`Fail input ${lines.join(",")}`);
    console.log(`Expected: ${expected_match}`);
    console.log(`Does: ${does_match}`);
  }
}

function runManyExamples() {
  for (let i = 0; i < 10000; i++) {
    generateExample();
  }
}

ex2();
ex3();
ex4();
ex5();
ex6();
ex7();
ex8();
runManyExamples();
ex9();
ex10();

console.log("Done tests");
