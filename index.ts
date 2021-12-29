const DEBUG = false;
type GroupsID = number;

class ReGroup {
  public id: GroupsID;
  public index: number;
  constructor(id: GroupsID, index: number) {
    this.id = id;
    this.index = index;
  }
}

class ReGroups {
  private id: GroupsID = 0;
  private maxGroups: number;
  constructor(maxGroups: number) {
    this.id = Math.floor(Math.random() * 100000);
    this.maxGroups = maxGroups;
  }

  public at(index: number): ReGroup {
    if (index >= this.maxGroups) {
      throw new Error(`The maximum index for this group is ${this.maxGroups}`);
    }
    return new ReGroup(this.getGroupsID(), index);
  }

  getGroupsID(): GroupsID {
    return this.id;
  }
}

class RePattern {
  constructor(pattern?: string, groups?: ReGroup[]) {}
}

let globalId = 0;

class ReNode {
  public finished: boolean = false;
  private id: number;
  constructor(finished?: boolean) {
    if (finished) {
      this.finished = finished;
    }
    this.id = globalId++;
  }

  public getId(): number {
    return this.id;
  }
}

enum ReEdgeType {
  CONSUME = "CONSUME",
  CONSUME_ANY = "CONSUME_ANY",
  EPSILON = "EPSILON", // skip
}

class ReEdge {
  public src: ReNode;
  public dest: ReNode;
  public type = ReEdgeType.CONSUME;
  public matchInverse = false;
  public pattern: string[] | undefined; // will generate "capture outputs"
  public timePattern: string | undefined;
  public groups: ReGroup[] | undefined = []; // "capture inputs"
  public captureGroups: ReGroups;

  constructor(
    src: ReNode,
    dest: ReNode,
    pattern?: string,
    timePattern?: string,
    groups?: ReGroup[],
    type?: ReEdgeType,
    matchInverse?: boolean
  ) {
    if (pattern) {
      this.pattern = pattern.split("{}");
    }
    this.timePattern = timePattern;
    this.groups = groups;
    this.dest = dest;
    this.src = src;
    if (type) {
      this.type = type;
    }
    this.matchInverse = matchInverse === true;
    this.captureGroups = new ReGroups(this.getNumPatternGroups(pattern));
  }

  private getNumPatternGroups(pattern?: string): number {
    if (!pattern) {
      return 0;
    }

    return pattern.split("(.*)").length; // TODO hacky hardcode
  }

  public getCaptureGroups(): ReGroups {
    return this.captureGroups;
  }

  private generateRegex(matchState: MatchState): RegExp {
    if (!this.pattern) {
      console.error("Cannot call generateRegex on edge with no pattern");
      return new RegExp("");
    }
    if (this.pattern.length === 1) {
      return new RegExp(this.pattern[0]);
    }
    console.assert(this.groups.length + 1 === this.pattern.length);
    let regexString = "";
    for (let i = 0; i < this.groups.length; i++) {
      regexString +=
        this.pattern[i] +
        matchState.capture[this.groups[i].id][this.groups[i].index];
    }
    regexString += this.pattern[this.pattern.length - 1];
    return new RegExp(regexString);
  }

  public handle(
    contents: ChaseFile,
    matchState: MatchState
  ): MatchState | null {
    const line = contents.getLine(matchState.lineNum);
    if (line === null) {
      // Can't handle missing input, but we *can* if epsilon, which consumes nothing
      if (this.type === ReEdgeType.EPSILON) {
        return {
          lineNum: matchState.lineNum,
          incomingEdge: this,
          capture: matchState.capture,
        };
      } else {
        return null;
      }
    }
    if (this.type === ReEdgeType.CONSUME_ANY) {
      return {
        lineNum: matchState.lineNum + 1,
        incomingEdge: this,
        capture: matchState.capture,
      };
    }
    if (this.type === ReEdgeType.EPSILON) {
      return {
        lineNum: matchState.lineNum,
        incomingEdge: this,
        capture: matchState.capture,
      };
    }
    if (!this.pattern) {
      console.error("No pattern..");
      return null;
    }

    const matches = line.match(this.generateRegex(matchState));
    if (this.matchInverse) {
      if (matches) {
        return null;
      }
      return {
        lineNum: matchState.lineNum + 1,
        incomingEdge: this,
        capture: matchState.capture,
      };
    } else {
      if (!matches) {
        return null;
      }
      matches.shift(); // remove the full match
      // console.log("add to capture: ", this.captureGroups.getGroupsID());
      matchState.capture[this.captureGroups.getGroupsID()] = matches;
      return {
        lineNum: matchState.lineNum + 1,
        incomingEdge: this,
        capture: matchState.capture,
      };
    }
    // TODO handle timestamps too, I think here..
  }

  // Edge can be handled if the line is within a time limit.
  public static buildTimedAllEdge(
    src: ReNode,
    dest: ReNode,
    timePattern?: string
  ): ReEdge {
    return new ReEdge(
      src,
      dest,
      undefined,
      undefined,
      undefined,
      ReEdgeType.CONSUME_ANY
    );
  }

  public static buildAllEdge(src: ReNode, dest: ReNode): ReEdge {
    return new ReEdge(
      src,
      dest,
      undefined,
      undefined,
      undefined,
      ReEdgeType.CONSUME_ANY
    );
  }

  // Edge can always be handled. Don't consume.
  public static buildEpsilonEdge(src: ReNode, dest: ReNode): ReEdge {
    return new ReEdge(
      src,
      dest,
      undefined,
      undefined,
      undefined,
      ReEdgeType.EPSILON
    );
  }

  public str(): string {
    return `Edge (pattern: ${this.pattern}, type: ${
      this.type
    }) to ${this.dest.getId()}`;
  }
}

class LogRegex {
  private description: string;
  public nodes: Map<number, ReNode> = new Map();
  public edges: Map<number, ReEdge[]> = new Map();
  public startNode: ReNode;
  private currentNode: ReNode;
  private prevNode: ReNode | undefined;
  constructor(description: string) {
    this.description = description;
    const new_node = this.addNode();
    this.currentNode = new_node;
    this.startNode = new_node;
  }

  private addNode() {
    const new_node = new ReNode();
    this.edges.set(new_node.getId(), []);
    this.nodes.set(new_node.getId(), new_node);
    if (this.currentNode) {
      this.currentNode.finished = false;
    }
    new_node.finished = true;
    return new_node;
  }

  public matchAllRepeat(timePattern?: string) {
    const skip_allowed_edge = ReEdge.buildTimedAllEdge(
      this.currentNode,
      this.currentNode,
      timePattern
    );
    this.edges.get(this.currentNode.getId())?.push(skip_allowed_edge);
  }

  public match(
    pattern: string,
    timePattern?: string,
    groups?: ReGroup[]
  ): ReGroups {
    const new_node = this.addNode();

    const forward_edge = new ReEdge(
      this.currentNode,
      new_node,
      pattern,
      timePattern,
      groups,
      ReEdgeType.CONSUME,
      false
    );
    this.edges.get(this.currentNode.getId())?.push(forward_edge);

    this.prevNode = this.currentNode;
    this.currentNode = new_node;

    return forward_edge.getCaptureGroups();
  }

  /**
   * Can have many "unmatching" matches. Should not skip otherwise.
   *
   * Building the following graph. this.currentNode is initially S0.
   *         ε
   *   ┌──────────────┐
   *   ▼              │
   * ┌────┐        ┌──┴─┐      ┌────┐
   * │ S0 ├───────►│ S1 │      │ S2 │
   * └─┬──┘   !a   └────┘      └────┘
   *   │                          ▲
   *   └──────────────────────────┘
   *                ε
   */
  public unmatchRepeat(
    pattern: string,
    timePattern?: string,
    groups?: ReGroup[]
  ) {
    const s1 = this.addNode();
    s1.finished = false;
    const s2 = this.addNode();

    // Forward edge
    this.edges
      .get(this.currentNode.getId())
      ?.push(
        new ReEdge(
          this.currentNode,
          s1,
          pattern,
          timePattern,
          groups,
          ReEdgeType.CONSUME,
          true
        )
      );

    // Can repeat .. go back to the previous state.
    this.edges
      .get(s1.getId())
      ?.push(ReEdge.buildEpsilonEdge(s1, this.currentNode));

    // Doesn't need to have an unmatch happen, not even 1 times.
    this.edges
      .get(this.currentNode.getId())
      ?.push(ReEdge.buildEpsilonEdge(this.currentNode, s2));

    this.prevNode = this.currentNode;
    this.currentNode = s2;
  }

  public describe() {
    for (const id of this.edges.keys()) {
      console.log(`Node ${id}. Finish ${this.nodes.get(id)?.finished}`);
      for (const edge of this.edges.get(id) || []) {
        console.log(`  ${edge.str()}`);
      }
    }
  }
}

class ChaseFile {
  public lines: string[];
  constructor(lines: string[]) {
    this.lines = lines;
  }

  public getLine(lineNum: number): string | null {
    if (lineNum >= this.lines.length) {
      return null;
    }
    return this.lines[lineNum];
  }

  public numLines(): number {
    return this.lines.length;
  }
}

interface MatchState {
  lineNum: number;
  incomingEdge: ReEdge;
  capture: Record<GroupsID, string[]>; // group identifier -> string[] (capture)
}

class Matcher {
  public execute(file_paths: string[], regexes: LogRegex[]) {}

  public match(contents: ChaseFile, logRe: LogRegex) {
    const startEdge = new ReEdge(
      logRe.startNode,
      logRe.startNode,
      undefined,
      undefined,
      undefined,
      ReEdgeType.EPSILON
    );
    const lineNumStack: MatchState[] = [
      { lineNum: 0, incomingEdge: startEdge, capture: {} },
    ];
    while (lineNumStack.length > 0) {
      //   console.log(`Nodes to go through (lineNumStack): ${lineNumStack.length}`);
      const matchState = lineNumStack.pop();
      if (matchState === undefined) {
        console.log("impossible");
        return false;
      }
      const node = matchState.incomingEdge.dest;
      const fromNode = matchState.incomingEdge.src;
      if (node.finished) {
        // console.log('finished');
        return true;
      }

      const edges = logRe.edges.get(node.getId());
      if (!edges) {
        console.log("impossible2");
        return false;
      }
      if (DEBUG) {
        console.log(
          `\n${fromNode.getId()} -> ${node.getId()}. Input: #${
            matchState.lineNum
          }: "${contents.getLine(matchState.lineNum)}", Iterate through ${
            edges.length
          } edges`
        );
      }
      for (const outgoingEdge of edges) {
        const nextMatchState = outgoingEdge.handle(contents, matchState);
        if (DEBUG) {
          console.log(
            `edge: ${outgoingEdge.str()} can_handle: ${nextMatchState !== null}`
          );
        }
        if (nextMatchState) {
          lineNumStack.push(nextMatchState);
        }
      }
    }
    return false;
  }
}

function ex2() {
  const file = new ChaseFile("a,b,b,b,c,a,d".split(","));
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
  const file = new ChaseFile("a,b,c,a,f,f,c".split(","));
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
  const file = new ChaseFile("a,b,c".split(","));
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
  const file = new ChaseFile("a,a,a,b,a,a,b,c".split(","));
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
  const file = new ChaseFile("a,c".split(","));
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
  const file = new ChaseFile("a,a,a,b,c".split(","));
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

  const file = new ChaseFile(contents.split("\n"));
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
  T60 dog is big and black
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

  const false_tests = [];
  false_tests.push((lre: LogRegex) => {
    lre.matchAllRepeat();
    const group = lre.match("dog is (.*) and (.*)");
    lre.matchAllRepeat();
    lre.match("color is {}", "<20s", [group.at(2)]); // at (2) is wrong
  });

  const file = new ChaseFile(contents.split("\n"));
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
  const does_match = matcher.match(new ChaseFile(lines), lre);
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

console.log("Done tests");
