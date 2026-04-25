const green = "\x1b[32m";
const yellow = "\x1b[33m";
const bold = "\x1b[1m";
const reset = "\x1b[0m";
const cyan = "\x1b[36m";

const snakeArt = `
${green}          ____
         / . .\\
         \\  ---<   ${bold}RATTLE-SNAKE v1.0${reset}${green}
          \\  /     ${reset}Target: Applicant Tracking Systems${green}
   ________/ /
  /  _______/      ${reset}Status: Ready to strike${green}
 /  /
 \\  \\___________
  \\___${bold}${yellow}RATTLE${reset}${green}__  \\
              \\  \\
               \\  \\_______
                \\___${bold}${yellow}SNAKE${reset}${green}__\\ ${reset}
`;

console.log(snakeArt);
console.log(`${cyan}> Local server: http://localhost:4321${reset}`);
console.log(`${yellow}> Metadata Camouflage: ACTIVE${reset}\n`);