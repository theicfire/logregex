const DEBUG = false;
type MatchId = number;
let globalNodeNum = 0;

class ReGroup {
  public id: MatchId;
  public index: number;
  constructor(id: MatchId, index: number) {
    this.id = id;
    this.index = index;
  }
}

enum TimeComparisonOperator {
  GT,
  LT,
}
export class TimeComparison {
  public id: MatchId;
  public timePattern: {
    operator: TimeComparisonOperator;
    delta__s: number;
    unit: string;
  };
  constructor(id: MatchId, timePattern: string) {
    this.id = id;
    this.timePattern = this.parseTimePattern(timePattern);
  }
  private parseTimePattern(timePattern: string) {
    const parts = timePattern.match(new RegExp(/([<>])(\d+)(\w)/));
    const operator =
      parts[1] == "<" ? TimeComparisonOperator.LT : TimeComparisonOperator.GT;
    const delta__s = parseInt(parts[2]);
    const unit = parts[3];
    if (unit !== "s") {
      throw new Error("only seconds supported");
    }
    return { operator, delta__s, unit };
  }
  public isTimeInBounds(matchState: MatchState, time: number): boolean {
    if (this.timePattern.operator == TimeComparisonOperator.LT) {
      return (
        time < matchState.timeMap[this.id] + this.timePattern.delta__s * 1000
      );
    } else if (this.timePattern.operator == TimeComparisonOperator.GT) {
      return (
        time > matchState.timeMap[this.id] + this.timePattern.delta__s * 1000
      );
    }
  }
}

class SingleMatch {
  private id: MatchId = 0;
  private maxGroups: number;
  constructor(maxGroups: number) {
    this.id = Math.floor(Math.random() * 100000);
    this.maxGroups = maxGroups;
  }

  /**
   * Gets a "reference" to a captured group.
   *
   * @param index The captured index, starting at 0.
   * @returns The purpose of this is to be put into a `LogRegex.match` call.
   */
  public at(index: number): ReGroup {
    if (index >= this.maxGroups) {
      throw new Error(`The maximum index for this group is ${this.maxGroups}`);
    }
    return new ReGroup(this.getId(), index);
  }

  /**
   * Gets a "reference" to a matched time
   *
   * @param timePattern "ex: <20s" meaning "with respect to this match, match another line that is within 20s". Only seconds are supported. Only < and > are supported.
   * @returns The purpose of this is to put into a `LogRegex.match` call.
   */
  public timeComparison(timePattern: string) {
    return new TimeComparison(this.getId(), timePattern);
  }

  getId(): MatchId {
    return this.id;
  }
}

class ReNode {
  public finished: boolean = false;
  private nodeNum: number;
  constructor(finished?: boolean) {
    if (finished) {
      this.finished = finished;
    }
    this.nodeNum = globalNodeNum++;
  }

  public getNodeNum(): number {
    return this.nodeNum;
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
  public timeComparison: TimeComparison | undefined;
  public groups: ReGroup[] | undefined = []; // "capture inputs"
  private singleMatchId: number = 0;

  constructor(
    src: ReNode,
    dest: ReNode,
    pattern?: string,
    timeComparison?: TimeComparison,
    groups?: ReGroup[],
    type?: ReEdgeType,
    matchInverse?: boolean
  ) {
    if (pattern) {
      this.pattern = pattern.split("{}");
    }
    this.timeComparison = timeComparison;
    this.groups = groups;
    this.dest = dest;
    this.src = src;
    if (type) {
      this.type = type;
    }
    this.matchInverse = matchInverse === true;
  }

  public setSingleMatchId(id: number) {
    this.singleMatchId = id;
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
        matchState.captureMap[this.groups[i].id][this.groups[i].index];
    }
    regexString += this.pattern[this.pattern.length - 1];
    return new RegExp(regexString);
  }

  public handle(
    contents: FileHandler,
    matchState: MatchState,
    parseTime: ParseTime
  ): MatchState | null {
    const line = contents.getLine(matchState.lineNum);
    if (line === null) {
      // Can't handle missing input, but we *can* if epsilon, which consumes nothing
      if (this.type === ReEdgeType.EPSILON) {
        return {
          ...matchState,
          incomingEdge: this,
        };
      } else {
        return null;
      }
    }
    if (this.type === ReEdgeType.CONSUME_ANY) {
      return {
        ...matchState,
        lineNum: matchState.lineNum + 1,
        incomingEdge: this,
      };
    }
    if (this.type === ReEdgeType.EPSILON) {
      return {
        ...matchState,
        incomingEdge: this,
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
        ...matchState,
        lineNum: matchState.lineNum + 1,
        incomingEdge: this,
      };
    } else {
      if (!matches) {
        return null;
      }

      if (this.timeComparison) {
        const timeAtLine = parseTime(line);
        if (!this.timeComparison.isTimeInBounds(matchState, timeAtLine)) {
          return null;
        }
      }

      matches.shift(); // remove the full match
      // console.log("add to capture: ", this.captureGroups.getGroupsID());
      if (this.singleMatchId !== 0) {
        matchState.captureMap[this.singleMatchId] = matches;
        matchState.timeMap[this.singleMatchId] = parseTime(line);
      }
      return {
        ...matchState,
        lineNum: matchState.lineNum + 1,
        incomingEdge: this,
      };
    }
    // TODO handle timestamps too, I think here..
  }

  // Edge can be handled if the line is within a time limit.
  public static buildTimedAllEdge(
    src: ReNode,
    dest: ReNode,
    timeComparison?: TimeComparison
  ): ReEdge {
    return new ReEdge(
      src,
      dest,
      undefined,
      timeComparison,
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
    }) to ${this.dest.getNodeNum()}`;
  }
}

type ParseTime = (line: string) => number;
interface ILogRegexOptions {
  description?: string;
  parseTime?: ParseTime;
}

export class LogRegex {
  public nodes: Map<number, ReNode> = new Map();
  public edges: Map<number, ReEdge[]> = new Map();
  public startNode: ReNode;
  private currentNode: ReNode;
  public parseTime: ParseTime;

  constructor(options?: ILogRegexOptions) {
    this.parseTime = options?.parseTime || LogRegex.parseTimeDefault;
    const new_node = this.addNode();
    this.currentNode = new_node;
    this.startNode = new_node;
  }

  private static parseTimeDefault(line: string): number {
    const ret = new Date(line.trim().split(" ")[0]).getTime();
    return ret;
  }

  private addNode() {
    const new_node = new ReNode();
    this.edges.set(new_node.getNodeNum(), []);
    this.nodes.set(new_node.getNodeNum(), new_node);
    if (this.currentNode) {
      this.currentNode.finished = false;
    }
    new_node.finished = true;
    return new_node;
  }

  private getNumPatternGroups(pattern?: string): number {
    if (!pattern) {
      return 0;
    }

    return pattern.split("(.*)").length; // TODO hacky hardcode
  }

  /**
   * Match zero or more lines in an ungreedy manner, unless the time requirement
   * is not met. "Ungreedy" means that this does not necessarily consume until
   * it does not find a match. It merely *can* consume until it does not find a
   * match.
   *
   * @param timeComparison An optional parameter that is the return value of SingleMatch.timeComparison()
   */
  public matchAllRepeat(timeComparison?: TimeComparison) {
    const skip_allowed_edge = ReEdge.buildTimedAllEdge(
      this.currentNode,
      this.currentNode,
      timeComparison
    );
    this.edges.get(this.currentNode.getNodeNum())?.push(skip_allowed_edge);
  }

  /**
   * Match a single line.
   *
   * @param pattern A regex pattern to match.
   * @param timeComparison An optional parameter that is the return value of SingleMatch.timeComparison()
   * @param groups An optional array. Each entry is constructed from the return value of SingleMatch.at()
   * @returns A SingleMatch
   */
  public match(
    pattern: string,
    timeComparison?: TimeComparison,
    groups?: ReGroup[]
  ): SingleMatch {
    const new_node = this.addNode();

    const forward_edge = new ReEdge(
      this.currentNode,
      new_node,
      pattern,
      timeComparison,
      groups,
      ReEdgeType.CONSUME,
      false
    );
    this.edges.get(this.currentNode.getNodeNum())?.push(forward_edge);

    this.currentNode = new_node;

    const singleMatch = new SingleMatch(this.getNumPatternGroups(pattern));
    forward_edge.setSingleMatchId(singleMatch.getId());

    return singleMatch;
  }

  /**
   * Find zero or more lines that do not match `pattern` in an ungreedy manner.
   * "Ungreedy" means that this does not necessarly consume until it finds a
   * match. It merely *can* consume until it finds a match.
   *
   * The graph this builds is confusing, so I've documented it here. this.currentNode is initially S0.
   *         ??
   *   ????????????????????????????????????????????????
   *   ???              ???
   * ??????????????????        ??????????????????      ??????????????????
   * ??? S0 ?????????????????????????????? S1 ???      ??? S2 ???
   * ??????????????????   !a   ??????????????????      ??????????????????
   *   ???                          ???
   *   ????????????????????????????????????????????????????????????????????????????????????
   *                ??
   *
   * @param pattern A regex pattern to NOT match.
   * @param timeComparison An optional parameter that is the return value of
   *  SingleMatch.timeComparison(). If a line does not match this time
   *  comparison, it is not matched. That is, the logic inversion is only for the
   *  match, but not for the time.
   * @param groups An optional array. Each entry is constructed from the return value of SingleMatch.at()
   */
  public unmatchRepeat(
    pattern: string,
    timeComparison?: TimeComparison,
    groups?: ReGroup[]
  ) {
    const s1 = this.addNode();
    s1.finished = false;
    const s2 = this.addNode();

    // Forward edge
    this.edges
      .get(this.currentNode.getNodeNum())
      ?.push(
        new ReEdge(
          this.currentNode,
          s1,
          pattern,
          timeComparison,
          groups,
          ReEdgeType.CONSUME,
          true
        )
      );

    // Can repeat .. go back to the previous state.
    this.edges
      .get(s1.getNodeNum())
      ?.push(ReEdge.buildEpsilonEdge(s1, this.currentNode));

    // Doesn't need to have an unmatch happen, not even 1 times.
    this.edges
      .get(this.currentNode.getNodeNum())
      ?.push(ReEdge.buildEpsilonEdge(this.currentNode, s2));

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

export class FileHandler {
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
  captureMap: Record<MatchId, string[]>; // group identifier -> string[] (capture)
  timeMap: Record<MatchId, number>; // group identifier -> time
}

export class Matcher {
  public execute(file_paths: string[], regexes: LogRegex[]) {}

  public match(contents: FileHandler, logRe: LogRegex) {
    const startEdge = new ReEdge(
      logRe.startNode,
      logRe.startNode,
      undefined,
      undefined,
      undefined,
      ReEdgeType.EPSILON
    );
    const lineNumStack: MatchState[] = [
      { lineNum: 0, incomingEdge: startEdge, captureMap: {}, timeMap: {} },
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

      const edges = logRe.edges.get(node.getNodeNum());
      if (!edges) {
        console.log("impossible2");
        return false;
      }
      if (DEBUG) {
        console.log(
          `\n${fromNode.getNodeNum()} -> ${node.getNodeNum()}. Input: #${
            matchState.lineNum
          }: "${contents.getLine(matchState.lineNum)}", Iterate through ${
            edges.length
          } edges`
        );
      }
      for (const outgoingEdge of edges) {
        const nextMatchState = outgoingEdge.handle(
          contents,
          matchState,
          logRe.parseTime
        );
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
